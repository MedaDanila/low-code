import type { Dictionary, EntityField, EntityObject, EntitySchema, FieldType, ObjectValue } from '../types/domain.js'

export type GeneratedApiResourceKind = 'entity' | 'dictionary'
export type GeneratedApiTransport = 'query' | 'body'
export type GeneratedApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'
export type GeneratedApiLogic = 'and' | 'or'
export type GeneratedApiOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'greaterOrEqual'
  | 'lessThan'
  | 'lessOrEqual'
  | 'in'
  | 'notIn'
  | 'filled'
  | 'empty'
  | 'today'
  | 'beforeToday'
  | 'afterToday'

export interface GeneratedApiField {
  key: string
  label: string
  type: FieldType | 'system'
  filterable: boolean
  sortable: boolean
  options?: string[]
}

export interface GeneratedApiEndpoint {
  id: string
  method: GeneratedApiMethod
  path: string
  title: string
  description: string
}

export interface GeneratedApiResource {
  id: string
  kind: GeneratedApiResourceKind
  name: string
  path: string
  count: number
  description: string
  fields: GeneratedApiField[]
  endpoints: GeneratedApiEndpoint[]
}

export interface GeneratedApiFilter {
  id: string
  field: string
  operator: GeneratedApiOperator
  value: string
}

export interface GeneratedApiRequest {
  resourceId: string
  transport: GeneratedApiTransport
  logic: GeneratedApiLogic
  filters: GeneratedApiFilter[]
  sort: string
  limit: number
  offset: number
}

export interface GeneratedApiResponse {
  total: number
  returned: number
  offset: number
  limit: number
  data: Record<string, unknown>[]
}

export interface GeneratedApiCatalogInput {
  schemas: EntitySchema[]
  objects: EntityObject[]
  dictionaries: Dictionary[]
}

interface RuntimeRow {
  raw: Record<string, unknown>
  output: Record<string, unknown>
}

export const generatedApiOperators: Array<{ label: string, value: GeneratedApiOperator, needsValue: boolean }> = [
  { label: 'Равно', value: 'equals', needsValue: true },
  { label: 'Не равно', value: 'notEquals', needsValue: true },
  { label: 'Содержит', value: 'contains', needsValue: true },
  { label: 'Начинается с', value: 'startsWith', needsValue: true },
  { label: 'Заканчивается на', value: 'endsWith', needsValue: true },
  { label: 'Больше', value: 'greaterThan', needsValue: true },
  { label: 'Больше или равно', value: 'greaterOrEqual', needsValue: true },
  { label: 'Меньше', value: 'lessThan', needsValue: true },
  { label: 'Меньше или равно', value: 'lessOrEqual', needsValue: true },
  { label: 'В списке', value: 'in', needsValue: true },
  { label: 'Не в списке', value: 'notIn', needsValue: true },
  { label: 'Заполнено', value: 'filled', needsValue: false },
  { label: 'Пусто', value: 'empty', needsValue: false },
  { label: 'Сегодня', value: 'today', needsValue: false },
  { label: 'До сегодня', value: 'beforeToday', needsValue: false },
  { label: 'После сегодня', value: 'afterToday', needsValue: false },
]

export const GENERATED_API_DEFAULT_LIMIT = 25
const GENERATED_API_MAX_LIMIT = 1000

export function createGeneratedApiCatalog(input: GeneratedApiCatalogInput): GeneratedApiResource[] {
  const activeSchemas = input.schemas.filter((schema) => schema.status === 'active')
  const activeSchemaIds = new Set(activeSchemas.map((schema) => schema.id))
  const entityResources = activeSchemas.map((schema) => createEntityResource(schema, input.objects, input.dictionaries))
  const dictionaryResources = input.dictionaries
    .filter((dictionary) => activeSchemaIds.has(dictionary.entityId))
    .map((dictionary) => createDictionaryResource(dictionary))

  return [...entityResources, ...dictionaryResources]
}

export function createGeneratedApiRequest(resource: GeneratedApiResource): GeneratedApiRequest {
  return {
    resourceId: resource.id,
    transport: 'query',
    logic: 'and',
    filters: [],
    sort: '',
    limit: GENERATED_API_DEFAULT_LIMIT,
    offset: 0,
  }
}

export function executeGeneratedApiRequest(
  resource: GeneratedApiResource,
  request: GeneratedApiRequest,
  input: GeneratedApiCatalogInput,
): GeneratedApiResponse {
  const rows = createRuntimeRows(resource, input)
  const usableFilters = request.filters.filter((filter) => {
    const field = resolveApiField(resource, filter.field)
    return Boolean(field && isFilterComplete(filter))
  })

  const filteredRows = rows.filter((row) => {
    if (usableFilters.length === 0) return true
    const checks = usableFilters.map((filter) => {
      const field = resolveApiField(resource, filter.field)
      return field ? matchesFilter(row.raw[field.key], filter, field) : true
    })
    return request.logic === 'or' ? checks.some(Boolean) : checks.every(Boolean)
  })

  const sortedRows = sortRows(filteredRows, request.sort)
  const limit = clampLimit(request.limit)
  const offset = Math.max(0, Number.isFinite(request.offset) ? Math.floor(request.offset) : 0)
  const page = sortedRows.slice(offset, offset + limit)

  return {
    total: filteredRows.length,
    returned: page.length,
    offset,
    limit,
    data: page.map((row) => row.output),
  }
}

export function createGeneratedApiQuery(resource: GeneratedApiResource, request: GeneratedApiRequest): string {
  const params: string[] = []
  request.filters.filter(isFilterComplete).forEach((filter) => {
    const field = resolveApiField(resource, filter.field)
    if (!field) return
    const operator = queryOperatorByRequestOperator(filter.operator)
    params.push(`${encodeQueryKey(`filters[${field.key}][${operator}]`)}=${encodeURIComponent(filter.value)}`)
  })
  if (request.logic === 'or') params.push('logic=or')
  if (request.sort) params.push(`sort=${encodeURIComponent(request.sort)}`)
  params.push(`limit=${clampLimit(request.limit)}`)
  params.push(`offset=${Math.max(0, Number.isFinite(request.offset) ? Math.floor(request.offset) : 0)}`)
  return `${resource.path}${params.length ? `?${params.join('&')}` : ''}`
}

export function createGeneratedApiBody(resource: GeneratedApiResource, request: GeneratedApiRequest): Record<string, unknown> {
  return {
    resource: resource.name,
    logic: request.logic,
    filters: request.filters.filter(isFilterComplete).map((filter) => {
      const field = resolveApiField(resource, filter.field)
      return {
        field: field?.label ?? filter.field,
        operator: operatorLabel(filter.operator),
        value: operatorNeedsValue(filter.operator) ? filter.value : undefined,
      }
    }),
    sort: request.sort || undefined,
    limit: clampLimit(request.limit),
    offset: Math.max(0, Number.isFinite(request.offset) ? Math.floor(request.offset) : 0),
  }
}

export function createGeneratedOpenApi(resources: GeneratedApiResource[]): Record<string, unknown> {
  const paths = resources.reduce<Record<string, unknown>>((acc, resource) => {
    resource.endpoints.forEach((endpoint) => {
      acc[endpoint.path] = {
        ...(acc[endpoint.path] as Record<string, unknown> | undefined),
        [endpoint.method.toLowerCase()]: {
          summary: endpoint.title,
          description: endpoint.description,
          tags: [resource.kind === 'entity' ? 'Сущности' : 'Справочники'],
          parameters: endpoint.method === 'GET'
            ? [
                { name: 'filters[поле][оператор]', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'logic', in: 'query', required: false, schema: { type: 'string', enum: ['and', 'or'] } },
                { name: 'sort', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
                { name: 'offset', in: 'query', required: false, schema: { type: 'integer' } },
              ]
            : [],
          requestBody: endpoint.method === 'POST' && endpoint.path.endsWith('/search')
            ? {
                required: false,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        logic: { type: 'string', enum: ['and', 'or'] },
                        filters: { type: 'array', items: { type: 'object' } },
                        sort: { type: 'string' },
                        limit: { type: 'integer' },
                        offset: { type: 'integer' },
                      },
                    },
                  },
                },
              }
            : undefined,
          responses: {
            200: {
              description: 'Данные успешно получены',
            },
          },
        },
      }
    })
    return acc
  }, {})

  return {
    openapi: '3.1.0',
    info: {
      title: 'Сгенерированное API платформы',
      version: '1.0.0',
    },
    paths,
  }
}

export function resolveApiField(resource: GeneratedApiResource, fieldKeyOrLabel: string): GeneratedApiField | undefined {
  const normalized = normalizeText(fieldKeyOrLabel)
  return resource.fields.find((field) =>
    field.key === fieldKeyOrLabel
    || field.key.replace(/^values\./, '') === fieldKeyOrLabel
    || normalizeText(field.label) === normalized,
  )
}

export function operatorNeedsValue(operator: GeneratedApiOperator): boolean {
  return generatedApiOperators.find((item) => item.value === operator)?.needsValue ?? true
}

export function operatorLabel(operator: GeneratedApiOperator): string {
  return generatedApiOperators.find((item) => item.value === operator)?.label ?? operator
}

function createEntityResource(schema: EntitySchema, objects: EntityObject[], dictionaries: Dictionary[]): GeneratedApiResource {
  const count = objects.filter((object) => object.entityId === schema.id).length
  const fields: GeneratedApiField[] = [
    { key: 'id', label: 'Идентификатор', type: 'system', filterable: true, sortable: true },
    { key: 'status', label: 'Статус', type: 'system', filterable: true, sortable: true },
    { key: 'createdAt', label: 'Создано', type: 'datetime', filterable: true, sortable: true },
    { key: 'updatedAt', label: 'Изменено', type: 'datetime', filterable: true, sortable: true },
    ...schema.fields
      .filter((field) => field.type !== 'file')
      .sort((left, right) => left.order - right.order)
      .map((field) => createFieldDescriptor(field, dictionaries)),
  ]

  return {
    id: `entity:${schema.id}`,
    kind: 'entity',
    name: schema.name,
    path: `/api/v1/entities/${schema.code}/objects`,
    count,
    description: schema.description || 'Объекты опубликованной сущности.',
    fields,
    endpoints: [
      {
        id: `${schema.id}:list`,
        method: 'GET',
        path: `/api/v1/entities/${schema.code}/objects`,
        title: `Список: ${schema.name}`,
        description: 'Возвращает объекты сущности с фильтрами, сортировкой и пагинацией через query-параметры.',
      },
      {
        id: `${schema.id}:search`,
        method: 'POST',
        path: `/api/v1/entities/${schema.code}/objects/search`,
        title: `Поиск: ${schema.name}`,
        description: 'Возвращает объекты сущности по тем же правилам фильтрации, но условия передаются в JSON-теле.',
      },
      {
        id: `${schema.id}:get`,
        method: 'GET',
        path: `/api/v1/entities/${schema.code}/objects/{id}`,
        title: `Карточка: ${schema.name}`,
        description: 'Возвращает один объект сущности по идентификатору.',
      },
      {
        id: `${schema.id}:create`,
        method: 'POST',
        path: `/api/v1/entities/${schema.code}/objects`,
        title: `Создание: ${schema.name}`,
        description: 'Создаёт объект сущности по опубликованной схеме полей.',
      },
      {
        id: `${schema.id}:update`,
        method: 'PATCH',
        path: `/api/v1/entities/${schema.code}/objects/{id}`,
        title: `Изменение: ${schema.name}`,
        description: 'Обновляет значения объекта сущности.',
      },
      {
        id: `${schema.id}:delete`,
        method: 'DELETE',
        path: `/api/v1/entities/${schema.code}/objects/{id}`,
        title: `Удаление: ${schema.name}`,
        description: 'Удаляет объект сущности с проверкой прав доступа.',
      },
    ],
  }
}

function createDictionaryResource(dictionary: Dictionary): GeneratedApiResource {
  return {
    id: `dictionary:${dictionary.id}`,
    kind: 'dictionary',
    name: dictionary.name,
    path: `/api/v1/dictionaries/${dictionary.code}/items`,
    count: dictionary.items.length,
    description: 'Значения справочника выбранной сущности.',
    fields: [
      { key: 'id', label: 'Идентификатор', type: 'system', filterable: true, sortable: true },
      { key: 'name', label: 'Название', type: 'string', filterable: true, sortable: true },
      { key: 'active', label: 'Активно', type: 'boolean', filterable: true, sortable: true, options: ['Да', 'Нет'] },
    ],
    endpoints: [
      {
        id: `${dictionary.id}:list`,
        method: 'GET',
        path: `/api/v1/dictionaries/${dictionary.code}/items`,
        title: `Значения: ${dictionary.name}`,
        description: 'Возвращает значения справочника с фильтрами, сортировкой и пагинацией через query-параметры.',
      },
      {
        id: `${dictionary.id}:search`,
        method: 'POST',
        path: `/api/v1/dictionaries/${dictionary.code}/items/search`,
        title: `Поиск: ${dictionary.name}`,
        description: 'Возвращает значения справочника по условиям в JSON-теле.',
      },
      {
        id: `${dictionary.id}:get`,
        method: 'GET',
        path: `/api/v1/dictionaries/${dictionary.code}/items/{id}`,
        title: `Значение: ${dictionary.name}`,
        description: 'Возвращает одно значение справочника по идентификатору.',
      },
    ],
  }
}

function createFieldDescriptor(field: EntityField, dictionaries: Dictionary[]): GeneratedApiField {
  const dictionary = dictionaries.find((item) => item.id === field.enumId)
  return {
    key: `values.${field.code}`,
    label: field.name,
    type: field.type,
    filterable: true,
    sortable: field.type !== 'text',
    options: field.type === 'enum' ? dictionary?.items.filter((item) => item.active).map((item) => item.name) : undefined,
  }
}

function createRuntimeRows(resource: GeneratedApiResource, input: GeneratedApiCatalogInput): RuntimeRow[] {
  if (resource.kind === 'dictionary') return createDictionaryRuntimeRows(resource, input.dictionaries)
  return createEntityRuntimeRows(resource, input.schemas, input.objects, input.dictionaries)
}

function createEntityRuntimeRows(
  resource: GeneratedApiResource,
  schemas: EntitySchema[],
  objects: EntityObject[],
  dictionaries: Dictionary[],
): RuntimeRow[] {
  const schema = schemas.find((candidate) => `entity:${candidate.id}` === resource.id)
  if (!schema) return []

  return objects
    .filter((object) => object.entityId === schema.id)
    .map((object) => {
      const raw: Record<string, unknown> = {
        id: object.id,
        status: object.status ?? '',
        createdAt: object.createdAt,
        updatedAt: object.updatedAt,
      }
      const output: Record<string, unknown> = {
        Идентификатор: object.id,
        Статус: object.status ?? '',
        Создано: object.createdAt,
        Изменено: object.updatedAt,
      }

      schema.fields
        .filter((field) => field.type !== 'file')
        .sort((left, right) => left.order - right.order)
        .forEach((field) => {
          const value = object.values[field.code] ?? null
          const formatted = formatObjectValue(value, field, dictionaries)
          raw[`values.${field.code}`] = formatted
          output[field.name] = formatted
        })

      return { raw, output }
    })
}

function createDictionaryRuntimeRows(resource: GeneratedApiResource, dictionaries: Dictionary[]): RuntimeRow[] {
  const dictionary = dictionaries.find((candidate) => `dictionary:${candidate.id}` === resource.id)
  if (!dictionary) return []

  return dictionary.items.map((item) => ({
    raw: {
      id: item.id,
      name: item.name,
      active: item.active ? 'Да' : 'Нет',
    },
    output: {
      Идентификатор: item.id,
      Название: item.name,
      Активно: item.active ? 'Да' : 'Нет',
    },
  }))
}

function formatObjectValue(value: ObjectValue, field: EntityField, dictionaries: Dictionary[]): string | number | boolean | string[] {
  if (value === null || value === undefined) return ''
  if (field.type === 'enum') {
    const dictionary = dictionaries.find((item) => item.id === field.enumId)
    if (Array.isArray(value)) {
      return value.map((code) => dictionary?.items.find((item) => item.code === code)?.name ?? code)
    }
    return dictionary?.items.find((item) => item.code === value)?.name ?? String(value)
  }
  if (field.type === 'boolean') return value ? 'Да' : 'Нет'
  return value
}

function matchesFilter(value: unknown, filter: GeneratedApiFilter, field: GeneratedApiField): boolean {
  if (filter.operator === 'filled') return !isEmpty(value)
  if (filter.operator === 'empty') return isEmpty(value)
  if (filter.operator === 'today') return compareDateToToday(value) === 0
  if (filter.operator === 'beforeToday') return compareDateToToday(value) < 0
  if (filter.operator === 'afterToday') return compareDateToToday(value) > 0

  const expected = filter.value
  if (filter.operator === 'in') return splitList(expected).some((candidate) => comparePrimitive(value, candidate, field.type) === 0)
  if (filter.operator === 'notIn') return splitList(expected).every((candidate) => comparePrimitive(value, candidate, field.type) !== 0)

  const comparison = comparePrimitive(value, expected, field.type)
  if (filter.operator === 'equals') return comparison === 0
  if (filter.operator === 'notEquals') return comparison !== 0
  if (filter.operator === 'greaterThan') return comparison > 0
  if (filter.operator === 'greaterOrEqual') return comparison >= 0
  if (filter.operator === 'lessThan') return comparison < 0
  if (filter.operator === 'lessOrEqual') return comparison <= 0

  const text = normalizeText(String(value ?? ''))
  const needle = normalizeText(expected)
  if (filter.operator === 'contains') return text.includes(needle)
  if (filter.operator === 'startsWith') return text.startsWith(needle)
  if (filter.operator === 'endsWith') return text.endsWith(needle)

  return true
}

function sortRows(rows: RuntimeRow[], sort: string): RuntimeRow[] {
  if (!sort) return rows
  const direction = sort.startsWith('-') ? -1 : 1
  const key = sort.replace(/^-/, '')
  return [...rows].sort((left, right) => {
    const leftValue = left.raw[key]
    const rightValue = right.raw[key]
    return comparePrimitive(leftValue, rightValue, 'system') * direction
  })
}

function comparePrimitive(left: unknown, right: unknown, type: GeneratedApiField['type']): number {
  const normalizedLeft = comparableValue(left, type)
  const normalizedRight = comparableValue(right, type)
  if (normalizedLeft === normalizedRight) return 0
  if (normalizedLeft > normalizedRight) return 1
  return -1
}

function comparableValue(value: unknown, type: GeneratedApiField['type']): string | number {
  if (isEmpty(value)) return ''
  if (type === 'integer' || type === 'decimal') {
    const number = Number(String(value).replace(',', '.'))
    return Number.isFinite(number) ? number : 0
  }
  if (type === 'date' || type === 'datetime') {
    const timestamp = Date.parse(String(value))
    return Number.isNaN(timestamp) ? 0 : timestamp
  }
  return normalizeText(Array.isArray(value) ? value.join(', ') : String(value))
}

function compareDateToToday(value: unknown): number {
  if (isEmpty(value)) return -1
  const timestamp = Date.parse(String(value))
  if (Number.isNaN(timestamp)) return -1
  const checked = new Date(timestamp)
  const today = new Date()
  const checkedStart = new Date(checked.getFullYear(), checked.getMonth(), checked.getDate()).getTime()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (checkedStart === todayStart) return 0
  return checkedStart > todayStart ? 1 : -1
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function isFilterComplete(filter: GeneratedApiFilter): boolean {
  return Boolean(filter.field && (!operatorNeedsValue(filter.operator) || filter.value.trim()))
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return GENERATED_API_DEFAULT_LIMIT
  return Math.min(GENERATED_API_MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

function queryOperatorByRequestOperator(operator: GeneratedApiOperator): string {
  const operators: Record<GeneratedApiOperator, string> = {
    equals: 'eq',
    notEquals: 'neq',
    contains: 'contains',
    startsWith: 'starts',
    endsWith: 'ends',
    greaterThan: 'gt',
    greaterOrEqual: 'gte',
    lessThan: 'lt',
    lessOrEqual: 'lte',
    in: 'in',
    notIn: 'notIn',
    filled: 'filled',
    empty: 'empty',
    today: 'today',
    beforeToday: 'beforeToday',
    afterToday: 'afterToday',
  }
  return operators[operator]
}

function encodeQueryKey(value: string): string {
  return value
    .split(/(\[|\])/)
    .map((part) => (part === '[' || part === ']' ? part : encodeURIComponent(part)))
    .join('')
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replaceAll('ё', 'е')
}
