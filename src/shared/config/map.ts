import type { Coordinates } from '../types/domain'

export const MAP_CONFIG = {
  defaultCenter: [44.0065, 56.3269] as Coordinates,
  defaultZoom: 12,
  tileUrl: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png',
}
