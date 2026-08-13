import type { Coordinates, DomainGeometry } from '../types/domain'

const OVERPASS_API_KEY = '0a3bc6e9c31eac4eb7daa0f8020ea634'
const OVERPASS_INTERPRETER_URL = 'https://overpass-api.de/api/interpreter'
const OVERPASS_RADIUS_METERS = 180
const OVERPASS_BUILDING_RADIUS_METERS = 70
const OVERPASS_RESULT_LIMIT = 80

interface OverpassCoordinate {
  lat?: number
  lon?: number
}

export interface OverpassTerritoryObject {
  id: string
  osmType: string
  name: string
  category: string
  distanceMeters: number | null
  tags: Record<string, string>
}

export interface OverpassBuildingGeometry {
  id: string
  osmType: string
  name: string
  distanceMeters: number
  geometry: DomainGeometry
  tags: Record<string, string>
}

interface OverpassResponse {
  elements?: OverpassElement[]
}

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: {
    lat?: number
    lon?: number
  }
  geometry?: OverpassCoordinate[]
  members?: Array<{
    role?: string
    type?: string
    geometry?: OverpassCoordinate[]
  }>
  tags?: Record<string, string>
}

export async function findTerritoryObjectsByCoordinates(
  coordinates: Coordinates,
  signal?: AbortSignal,
): Promise<OverpassTerritoryObject[]> {
  const [lon, lat] = coordinates
  const query = createTerritoryQuery(lat, lon)
  const payload = await requestOverpass(query, signal)
  return (payload.elements ?? [])
    .map((element) => normalizeOverpassElement(element, lat, lon))
    .filter((item): item is OverpassTerritoryObject => Boolean(item))
    .sort((left, right) => {
      if (left.distanceMeters === null && right.distanceMeters === null) return left.name.localeCompare(right.name, 'ru')
      if (left.distanceMeters === null) return -1
      if (right.distanceMeters === null) return 1
      return left.distanceMeters - right.distanceMeters
    })
}

export async function findBuildingGeometryByCoordinates(
  coordinates: Coordinates,
  signal?: AbortSignal,
): Promise<OverpassBuildingGeometry | null> {
  const [lon, lat] = coordinates
  const payload = await requestOverpass(createBuildingQuery(lat, lon), signal)
  const candidates = (payload.elements ?? [])
    .map((element) => normalizeBuildingElement(element, lat, lon))
    .filter((item): item is OverpassBuildingGeometry => Boolean(item))

  candidates.sort((left, right) => {
    const leftContainsPoint = geometryContainsPoint(left.geometry, coordinates)
    const rightContainsPoint = geometryContainsPoint(right.geometry, coordinates)
    if (leftContainsPoint !== rightContainsPoint) return leftContainsPoint ? -1 : 1
    return left.distanceMeters - right.distanceMeters
  })

  return candidates[0] ?? null
}

async function requestOverpass(query: string, signal?: AbortSignal): Promise<OverpassResponse> {
  const body = new URLSearchParams({
    data: query,
    key: OVERPASS_API_KEY,
  })

  const response = await fetch(OVERPASS_INTERPRETER_URL, {
    method: 'POST',
    signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`Overpass API вернул ${response.status}`)
  }

  return await response.json() as OverpassResponse
}

function createTerritoryQuery(lat: number, lon: number): string {
  return `
[out:json][timeout:25];
is_in(${lat},${lon})->.inside;
(
  area.inside[boundary=administrative];
  area.inside[place];
  area.inside[landuse];
  node(around:${OVERPASS_RADIUS_METERS},${lat},${lon})[name];
  way(around:${OVERPASS_RADIUS_METERS},${lat},${lon})[name];
  relation(around:${OVERPASS_RADIUS_METERS},${lat},${lon})[name];
);
out tags center ${OVERPASS_RESULT_LIMIT};
  `.trim()
}

function createBuildingQuery(lat: number, lon: number): string {
  return `
[out:json][timeout:25];
(
  way(around:${OVERPASS_BUILDING_RADIUS_METERS},${lat},${lon})["building"];
  relation(around:${OVERPASS_BUILDING_RADIUS_METERS},${lat},${lon})["building"];
);
out body geom 25;
  `.trim()
}

function normalizeOverpassElement(
  element: OverpassElement,
  sourceLat: number,
  sourceLon: number,
): OverpassTerritoryObject | null {
  const tags = element.tags ?? {}
  const name = tags.name || tags['name:ru'] || tags.official_name || tags.operator || tags.brand
  if (!name) return null

  const lat = element.lat ?? element.center?.lat
  const lon = element.lon ?? element.center?.lon
  const distanceMeters = Number.isFinite(lat) && Number.isFinite(lon)
    ? haversineMeters(sourceLat, sourceLon, Number(lat), Number(lon))
    : null

  return {
    id: `${element.type}_${element.id}`,
    osmType: osmTypeLabel(element.type),
    name,
    category: categoryLabel(tags),
    distanceMeters,
    tags,
  }
}

function normalizeBuildingElement(
  element: OverpassElement,
  sourceLat: number,
  sourceLon: number,
): OverpassBuildingGeometry | null {
  const tags = element.tags ?? {}
  const ring = extractBuildingRing(element)
  if (!ring) return null
  const overpassCenter = element.center
  const center = overpassCenter && Number.isFinite(overpassCenter.lat) && Number.isFinite(overpassCenter.lon)
    ? [Number(overpassCenter.lon), Number(overpassCenter.lat)] as Coordinates
    : ringCenter(ring)
  const name = tags.name
    || tags['name:ru']
    || (tags['addr:housenumber'] ? `Дом ${tags['addr:housenumber']}` : '')
    || buildingTypeLabel(tags.building)

  return {
    id: `${element.type}_${element.id}`,
    osmType: osmTypeLabel(element.type),
    name,
    distanceMeters: haversineMeters(sourceLat, sourceLon, center[1], center[0]),
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
    tags,
  }
}

function extractBuildingRing(element: OverpassElement): Coordinates[] | null {
  const directRing = normalizeRing(element.geometry)
  if (directRing) return directRing

  const memberRings = (element.members ?? [])
    .filter((member) => !member.role || member.role === 'outer')
    .map((member) => normalizeRing(member.geometry))
    .filter((ring): ring is Coordinates[] => Boolean(ring))
    .sort((left, right) => right.length - left.length)

  return memberRings[0] ?? null
}

function normalizeRing(points?: OverpassCoordinate[]): Coordinates[] | null {
  const ring = (points ?? [])
    .map((point) => [Number(point.lon), Number(point.lat)] as Coordinates)
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
  if (ring.length < 3) return null
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]])
  }
  return ring
}

function ringCenter(ring: Coordinates[]): Coordinates {
  const uniquePoints = ring.slice(0, -1)
  const sum = uniquePoints.reduce<Coordinates>((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0])
  return [sum[0] / uniquePoints.length, sum[1] / uniquePoints.length]
}

function buildingTypeLabel(value?: string): string {
  if (!value || value === 'yes') return 'Здание'
  return `Здание: ${value}`
}

function geometryContainsPoint(geometry: DomainGeometry, point: Coordinates): boolean {
  return geometry.type === 'Polygon' && pointInRing(point, geometry.coordinates[0])
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

function categoryLabel(tags: Record<string, string>): string {
  if (tags.boundary === 'administrative') return tags.admin_level ? `Административная территория, уровень ${tags.admin_level}` : 'Административная территория'
  if (tags.place) return `Населённый пункт: ${tags.place}`
  if (tags.landuse) return `Зона: ${tags.landuse}`
  if (tags.amenity) return `Объект: ${tags.amenity}`
  if (tags.shop) return `Магазин: ${tags.shop}`
  if (tags.office) return `Организация: ${tags.office}`
  if (tags.leisure) return `Досуг: ${tags.leisure}`
  if (tags.tourism) return `Туризм: ${tags.tourism}`
  if (tags.building) return `Здание: ${tags.building}`
  if (tags.highway) return `Дорога: ${tags.highway}`
  return 'Объект OpenStreetMap'
}

function osmTypeLabel(type: string): string {
  if (type === 'node') return 'Точка'
  if (type === 'way') return 'Линия/контур'
  if (type === 'relation') return 'Связь'
  if (type === 'area') return 'Территория'
  return type
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusMeters = 6_371_000
  const latDelta = toRadians(lat2 - lat1)
  const lonDelta = toRadians(lon2 - lon1)
  const a =
    Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lonDelta / 2) ** 2
  return Math.round(radiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function toRadians(value: number): number {
  return value * Math.PI / 180
}
