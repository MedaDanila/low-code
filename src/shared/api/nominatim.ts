import type { Coordinates, DomainGeometry } from '../types/domain'

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'

type GeoJsonGeometry =
  | { type: 'Point'; coordinates: unknown }
  | { type: 'LineString'; coordinates: unknown }
  | { type: 'Polygon'; coordinates: unknown }
  | { type: 'MultiPolygon'; coordinates: unknown }
  | { type: 'GeometryCollection'; geometries?: GeoJsonGeometry[] }

interface NominatimFeatureCollection {
  features?: NominatimFeature[]
}

interface NominatimFeature {
  geometry?: GeoJsonGeometry | null
  properties?: {
    osm_type?: string
    osm_id?: string | number
    display_name?: string
    name?: string | null
    type?: string
    addresstype?: string
    address?: Record<string, string | undefined>
  } & Record<string, unknown>
}

export interface NominatimBuildingGeometry {
  id: string
  osmType: string
  name: string
  geometry: DomainGeometry
  properties: Record<string, unknown>
}

export async function findBuildingGeometryByCoordinates(
  coordinates: Coordinates,
  signal?: AbortSignal,
): Promise<NominatimBuildingGeometry | null> {
  const [lon, lat] = coordinates
  const url = new URL(NOMINATIM_REVERSE_URL)
  url.search = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'geojson',
    polygon_geojson: '1',
    zoom: '18',
    'accept-language': 'ru',
  }).toString()

  const response = await fetch(url, {
    method: 'GET',
    signal,
    headers: {
      Accept: 'application/geo+json, application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Nominatim вернул ${response.status}`)
  }

  const payload = await response.json() as NominatimFeatureCollection
  const feature = payload.features?.[0]
  const geometry = feature?.geometry ? toDomainPolygon(feature.geometry, coordinates) : null
  if (!feature || !geometry) return null

  const properties = feature.properties ?? {}
  return {
    id: `${properties.osm_type ?? 'nominatim'}_${properties.osm_id ?? `${lat}_${lon}`}`,
    osmType: osmTypeLabel(String(properties.osm_type ?? '')),
    name: featureName(properties),
    geometry,
    properties,
  }
}

function toDomainPolygon(geometry: GeoJsonGeometry, sourcePoint: Coordinates): DomainGeometry | null {
  if (geometry.type === 'Polygon') {
    const polygon = normalizePolygon(geometry.coordinates)
    return polygon ? { type: 'Polygon', coordinates: polygon } : null
  }

  if (geometry.type === 'MultiPolygon') {
    const polygons = normalizeMultiPolygon(geometry.coordinates)
    const selected = polygons.find((polygon) => pointInRing(sourcePoint, polygon[0])) ?? largestPolygon(polygons)
    return selected ? { type: 'Polygon', coordinates: selected } : null
  }

  if (geometry.type === 'GeometryCollection') {
    const polygons = (Array.isArray(geometry.geometries) ? geometry.geometries : [])
      .map((item) => toDomainPolygon(item, sourcePoint))
      .filter((item): item is DomainGeometry & { type: 'Polygon' } => item?.type === 'Polygon')
      .map((item) => item.coordinates)
    const selected = polygons.find((polygon) => pointInRing(sourcePoint, polygon[0])) ?? largestPolygon(polygons)
    return selected ? { type: 'Polygon', coordinates: selected } : null
  }

  return null
}

function normalizeMultiPolygon(value: unknown): Coordinates[][][] {
  if (!Array.isArray(value)) return []
  return value
    .map((polygon) => normalizePolygon(polygon))
    .filter((polygon): polygon is Coordinates[][] => Boolean(polygon))
}

function normalizePolygon(value: unknown): Coordinates[][] | null {
  if (!Array.isArray(value)) return null
  const rings = value
    .map((ring) => normalizeRing(ring))
    .filter((ring): ring is Coordinates[] => Boolean(ring))
  return rings.length > 0 ? rings : null
}

function normalizeRing(value: unknown): Coordinates[] | null {
  if (!Array.isArray(value)) return null
  const ring = value
    .map((point) => normalizePoint(point))
    .filter((point): point is Coordinates => Boolean(point))
  if (ring.length < 3) return null
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]])
  }
  return ring
}

function normalizePoint(value: unknown): Coordinates | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const lon = Number(value[0])
  const lat = Number(value[1])
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null
}

function largestPolygon(polygons: Coordinates[][][]): Coordinates[][] | null {
  return [...polygons].sort((left, right) => ringArea(right[0]) - ringArea(left[0]))[0] ?? null
}

function ringArea(ring: Coordinates[]): number {
  return Math.abs(ring.slice(1).reduce((sum, point, index) => {
    const previous = ring[index]
    return sum + previous[0] * point[1] - point[0] * previous[1]
  }, 0))
}

function pointInRing(point: Coordinates, ring: Coordinates[]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function featureName(properties: NonNullable<NominatimFeature['properties']>): string {
  const address = properties.address ?? {}
  return properties.name
    || address.building
    || (address.house_number ? `Дом ${address.house_number}` : '')
    || properties.display_name
    || 'Здание'
}

function osmTypeLabel(type: string): string {
  if (type === 'node') return 'Точка'
  if (type === 'way') return 'Контур'
  if (type === 'relation') return 'Связь'
  return type || 'OpenStreetMap'
}
