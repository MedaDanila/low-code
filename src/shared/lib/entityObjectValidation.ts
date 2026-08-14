import type { Dictionary, DomainGeometry, EntityObjectValues, EntitySchema, MapGeometryType, ObjectValue } from '../types/domain'

export const OBJECT_STATUS_PUBLISHED = 'published'
export const OBJECT_STATUS_DRAFT = 'draft'

export type ObjectDataStatus = typeof OBJECT_STATUS_PUBLISHED | typeof OBJECT_STATUS_DRAFT

export interface EntityObjectDataValidationIssue {
  fieldCode?: string
  message: string
}

interface EntityObjectDataValidationInput {
  schema?: EntitySchema
  dictionaries?: Dictionary[]
  values: EntityObjectValues
  geometry?: DomainGeometry
}

const ADDRESS_LOCALITY_PATTERN = /(?:^|[\s,])(?:г|город|с|село|деревня|п|пос|поселок|посёлок|рп|рабочий поселок|рабочий посёлок)\.?\s+[а-яa-z0-9-]+/i
const ADDRESS_VILLAGE_SHORT_PATTERN = /(?:^|[\s,])д\.?\s+(?![0-9])[а-яa-z0-9-]+/i
const ADDRESS_HOUSE_PATTERN = /(?:^|[\s,])(?:д|дом|вл|владение|стр|строение|корп|корпус)\.?\s*[0-9]+[а-яa-z0-9/-]*/i
const ADDRESS_STREET_TYPE_PATTERN = '(?:улица|ул|проспект|пр-кт|пр-т|просп|пр|переулок|пер|шоссе|ш|тракт|тр|дорога|дор|проезд|пр-д|прзд|бульвар|б-р|бул|площадь|пл|набережная|наб|аллея|ал|линия|лин|лн|тупик|туп|микрорайон|мкр|квартал|кв-л|территория|тер|просека|просек|спуск|съезд|заезд|въезд|магистраль|кольцо)'
const ADDRESS_STREET_PART_PATTERN = new RegExp(`(?:^|[\\s,])${ADDRESS_STREET_TYPE_PATTERN}\\.?\\s+[а-яa-z0-9-]+`, 'i')
const ADDRESS_STREET_PART_SUFFIX_PATTERN = new RegExp(`(?:^|[\\s,])[а-яa-z0-9-]+(?:\\s+[а-яa-z0-9-]+){0,3}\\s+${ADDRESS_STREET_TYPE_PATTERN}\\.?(?:[\\s,]|$)`, 'i')
const ADDRESS_HOUSE_AFTER_STREET_PATTERN = new RegExp(`${ADDRESS_STREET_TYPE_PATTERN}\\.?\\s+[^,]+,\\s*(?:д|дом)?\\.?\\s*[0-9]+[а-яa-z0-9/-]*`, 'i')
const ADDRESS_HOUSE_AFTER_STREET_SUFFIX_PATTERN = new RegExp(`[а-яa-z0-9-]+(?:\\s+[а-яa-z0-9-]+){0,3}\\s+${ADDRESS_STREET_TYPE_PATTERN}\\.?,\\s*(?:д|дом)?\\.?\\s*[0-9]+[а-яa-z0-9/-]*`, 'i')

export function validateEntityObjectData(input: EntityObjectDataValidationInput): EntityObjectDataValidationIssue[] {
  const { schema, dictionaries = [], values, geometry } = input
  if (!schema) return [{ message: 'Сущность не найдена' }]

  const issues: EntityObjectDataValidationIssue[] = []

  schema.fields.forEach((field) => {
    const value = values[field.code]
    if (field.required && isEmptyValue(value)) {
      issues.push({ fieldCode: field.code, message: `Поле «${field.name}» обязательно` })
      return
    }

    if (field.type === 'address' && typeof value === 'string' && value.trim()) {
      const addressCheck = validateAddressCompleteness(value)
      if (!addressCheck.ok) {
        issues.push({
          fieldCode: field.code,
          message: `Адрес заполнен не полностью: ${addressCheck.missing.join(', ')}`,
        })
      }
    }

    if (field.type === 'enum' && !isEmptyValue(value)) {
      const dictionary = dictionaries.find((item) => item.id === field.enumId)
      const hasItem = dictionary?.items.some((item) => item.active && item.code === value)
      if (!hasItem) {
        issues.push({ fieldCode: field.code, message: `Значение поля «${field.name}» не найдено в справочнике` })
      }
    }
  })

  if (requiresGeometry(schema)) {
    if (!geometry) {
      issues.push({ message: 'Геометрия не определена' })
    } else if (!schema.mapSettings.enabledGeometryTypes.includes(domainGeometryToMapType(geometry))) {
      issues.push({ message: 'Тип геометрии не разрешён для сущности' })
    }
  }

  if (Object.keys(values).length === 0) {
    issues.push({ message: 'В записи нет данных' })
  }

  return issues
}

export function objectDataStatusFromIssues(issues: EntityObjectDataValidationIssue[]): ObjectDataStatus {
  return issues.length === 0 ? OBJECT_STATUS_PUBLISHED : OBJECT_STATUS_DRAFT
}

export function validateAddressCompleteness(address: string): { ok: boolean; missing: string[] } {
  const normalized = normalizeAddress(address)
  const hasLocality = ADDRESS_LOCALITY_PATTERN.test(normalized) || ADDRESS_VILLAGE_SHORT_PATTERN.test(normalized)
  const hasStreetPart = ADDRESS_STREET_PART_PATTERN.test(normalized) || ADDRESS_STREET_PART_SUFFIX_PATTERN.test(normalized)
  const hasHouse = ADDRESS_HOUSE_PATTERN.test(normalized)
    || ADDRESS_HOUSE_AFTER_STREET_PATTERN.test(normalized)
    || ADDRESS_HOUSE_AFTER_STREET_SUFFIX_PATTERN.test(normalized)

  const missing = [
    ...(hasLocality ? [] : ['город/село/деревня']),
    ...(hasStreetPart ? [] : ['улица/проспект/шоссе']),
    ...(hasHouse ? [] : ['номер дома']),
  ]

  return { ok: missing.length === 0, missing }
}

function requiresGeometry(schema: EntitySchema): boolean {
  return schema.geometryType !== 'none' && schema.mapSettings.enabledGeometryTypes.length > 0
}

function domainGeometryToMapType(geometry: DomainGeometry): MapGeometryType {
  if (geometry.type === 'LineString') return 'lineString'
  if (geometry.type === 'Polygon') return 'polygon'
  return 'point'
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replaceAll('ё', 'е')
}

function isEmptyValue(value: ObjectValue | undefined): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}
