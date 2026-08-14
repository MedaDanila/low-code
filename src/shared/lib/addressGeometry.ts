import { geocodeAddress } from '../api/dadata'
import { findBuildingGeometryByCoordinates } from '../api/overpass'
import type { Coordinates, DomainGeometry, EntityObjectValues, EntitySchema } from '../types/domain'
import { validateAddressCompleteness } from './entityObjectValidation'

export interface ResolvedAddressGeometry {
  values: EntityObjectValues
  status: string
  geometry?: DomainGeometry
}

export async function resolveAddressGeometryForValues(
  schema: EntitySchema,
  values: EntityObjectValues,
  signal?: AbortSignal,
): Promise<ResolvedAddressGeometry> {
  const addressField = schema.fields.find((field) => (
    field.type === 'address'
    && typeof values[field.code] === 'string'
    && String(values[field.code]).trim()
  ))
  const address = addressField ? String(values[addressField.code]).trim() : ''
  if (!address) return { values, status: 'Адрес не указан' }

  const addressCheck = validateAddressCompleteness(address)
  if (!addressCheck.ok) {
    return { values, status: `Адрес заполнен не полностью: ${addressCheck.missing.join(', ')}` }
  }

  const suggestion = await geocodeAddress(address, signal)
  const geoLon = suggestion?.geoLon
  const geoLat = suggestion?.geoLat
  if (!Number.isFinite(geoLon) || !Number.isFinite(geoLat)) {
    return { values, status: 'Координаты не найдены' }
  }

  const normalizedValues = suggestion?.value && addressField
    ? { ...values, [addressField.code]: suggestion.value }
    : { ...values }
  const coordinates: Coordinates = [geoLon!, geoLat!]

  try {
    const building = await findBuildingGeometryByCoordinates(coordinates, signal)
    if (building?.geometry) {
      return {
        values: normalizedValues,
        geometry: building.geometry,
        status: building.name ? `Контур здания найден: ${building.name}` : 'Контур здания найден',
      }
    }
  } catch (cause) {
    if ((cause as DOMException).name === 'AbortError') throw cause
    return {
      values: normalizedValues,
      geometry: { type: 'Point', coordinates },
      status: 'Overpass недоступен, сохранена точка адреса',
    }
  }

  return {
    values: normalizedValues,
    geometry: { type: 'Point', coordinates },
    status: 'Здание не найдено, сохранена точка адреса',
  }
}
