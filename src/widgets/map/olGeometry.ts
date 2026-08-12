import Feature from 'ol/Feature'
import { fromLonLat, toLonLat } from 'ol/proj'
import Geometry from 'ol/geom/Geometry'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import type { Coordinate } from 'ol/coordinate'
import type { Coordinates, DomainGeometry } from '../../shared/types/domain'

export function domainToFeature(geometry: DomainGeometry): Feature<Geometry> {
  return new Feature({ geometry: domainToOlGeometry(geometry) })
}

export function domainToOlGeometry(geometry: DomainGeometry): Geometry {
  if (geometry.type === 'Point') return new Point(project(geometry.coordinates))
  if (geometry.type === 'LineString') return new LineString(geometry.coordinates.map(project))
  return new Polygon(geometry.coordinates.map((ring) => ring.map(project)))
}

export function olToDomainGeometry(geometry: Geometry | undefined): DomainGeometry | undefined {
  if (!geometry) return undefined
  if (geometry instanceof Point) {
    return { type: 'Point', coordinates: unproject(geometry.getCoordinates()) }
  }
  if (geometry instanceof LineString) {
    return { type: 'LineString', coordinates: geometry.getCoordinates().map(unproject) }
  }
  if (geometry instanceof Polygon) {
    return { type: 'Polygon', coordinates: geometry.getCoordinates().map((ring) => ring.map(unproject)) }
  }
  return undefined
}

function project(coordinates: Coordinates): Coordinate {
  return fromLonLat(coordinates)
}

function unproject(coordinates: Coordinate): Coordinates {
  const [lon, lat] = toLonLat(coordinates)
  return [Number(lon.toFixed(6)), Number(lat.toFixed(6))]
}
