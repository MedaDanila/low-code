import type { Coordinates, DomainGeometry } from '../types/domain'

export function geometryCenter(geometry?: DomainGeometry): Coordinates {
  if (!geometry) return [44.0065, 56.3269]
  if (geometry.type === 'Point') return geometry.coordinates
  const points = geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates[0]
  const sum = points.reduce<Coordinates>((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0])
  return [sum[0] / points.length, sum[1] / points.length]
}

export function polygonAreaSqMeters(geometry?: DomainGeometry): number {
  if (!geometry || geometry.type !== 'Polygon') return 0
  const ring = geometry.coordinates[0]
  const metersPerDegree = 111_320
  let area = 0
  for (let i = 0; i < ring.length - 1; i += 1) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return Math.abs(area / 2) * metersPerDegree * metersPerDegree * Math.cos((ring[0][1] * Math.PI) / 180)
}

export function geometryLengthMeters(geometry?: DomainGeometry): number {
  const points =
    geometry?.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry?.type === 'LineString'
        ? geometry.coordinates
        : []
  return points.slice(1).reduce((sum, point, index) => sum + distanceMeters(points[index], point), 0)
}

export function geometriesIntersect(a?: DomainGeometry, b?: DomainGeometry): boolean {
  if (!a || !b) return false
  const boxA = boundingBox(a)
  const boxB = boundingBox(b)
  return boxA.minX <= boxB.maxX && boxA.maxX >= boxB.minX && boxA.minY <= boxB.maxY && boxA.maxY >= boxB.minY
}

export function distanceBetweenGeometriesMeters(a?: DomainGeometry, b?: DomainGeometry): number {
  return distanceMeters(geometryCenter(a), geometryCenter(b))
}

function boundingBox(geometry: DomainGeometry) {
  const points =
    geometry.type === 'Point'
      ? [geometry.coordinates]
      : geometry.type === 'LineString'
        ? geometry.coordinates
        : geometry.coordinates.flat()
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

function distanceMeters(a: Coordinates, b: Coordinates): number {
  const earthRadius = 6_371_000
  const lat1 = (a[1] * Math.PI) / 180
  const lat2 = (b[1] * Math.PI) / 180
  const deltaLat = ((b[1] - a[1]) * Math.PI) / 180
  const deltaLon = ((b[0] - a[0]) * Math.PI) / 180
  const h =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}
