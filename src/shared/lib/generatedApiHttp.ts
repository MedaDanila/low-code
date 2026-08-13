import {
  createGeneratedApiCatalog,
  createGeneratedApiRequest,
  createGeneratedOpenApi,
  executeGeneratedApiRequest,
  generatedApiOperators,
  operatorNeedsValue,
  resolveApiField,
  type GeneratedApiFilter,
  type GeneratedApiLogic,
  type GeneratedApiOperator,
  type GeneratedApiRequest,
  type GeneratedApiResource,
} from './generatedApi.js'
import type { GeneratedApiCatalogInput } from './generatedApi.js'

export interface GeneratedApiHttpInput {
  method: string
  pathname: string
  searchParams: URLSearchParams
  body?: unknown
  db: GeneratedApiCatalogInput
}

export interface GeneratedApiHttpResult {
  status: number
  body: unknown
}

const queryOperators: Record<string, GeneratedApiOperator> = {
  eq: 'equals',
  equals: 'equals',
  ne: 'notEquals',
  neq: 'notEquals',
  notEquals: 'notEquals',
  contains: 'contains',
  starts: 'startsWith',
  startsWith: 'startsWith',
  ends: 'endsWith',
  endsWith: 'endsWith',
  gt: 'greaterThan',
  greaterThan: 'greaterThan',
  gte: 'greaterOrEqual',
  greaterOrEqual: 'greaterOrEqual',
  lt: 'lessThan',
  lessThan: 'lessThan',
  lte: 'lessOrEqual',
  lessOrEqual: 'lessOrEqual',
  in: 'in',
  notIn: 'notIn',
  notin: 'notIn',
  filled: 'filled',
  notNull: 'filled',
  empty: 'empty',
  null: 'empty',
  today: 'today',
  beforeToday: 'beforeToday',
  afterToday: 'afterToday',
}

export function handleGeneratedApiHttpRequest(input: GeneratedApiHttpInput): GeneratedApiHttpResult {
  const resources = createGeneratedApiCatalog(input.db)
  const pathname = normalizePath(input.pathname)

  if (pathname === '/api/v1/openapi.json') {
    return json(200, createGeneratedOpenApi(resources))
  }

  const match = findResource(pathname, resources)
  if (!match) {
    return json(404, {
      error: 'Ручка не найдена',
      message: 'Проверьте код сущности или справочника. Если данные только что созданы в интерфейсе, обновите страницу приложения один раз.',
      available: resources.map((resource) => resource.path),
    })
  }

  if (match.action === 'item') return handleItem(input, match.resource, match.itemId)
  return handleCollection(input, match.resource, match.action)
}

function handleCollection(
  input: GeneratedApiHttpInput,
  resource: GeneratedApiResource,
  action: 'list' | 'search',
): GeneratedApiHttpResult {
  if (action === 'list' && input.method !== 'GET') return methodNotAllowed(['GET'])
  if (action === 'search' && input.method !== 'POST') return methodNotAllowed(['POST'])

  const request = action === 'search'
    ? requestFromBody(resource, input.body)
    : requestFromQuery(resource, input.searchParams)
  const response = executeGeneratedApiRequest(resource, request, input.db)
  return json(200, response)
}

function handleItem(
  input: GeneratedApiHttpInput,
  resource: GeneratedApiResource,
  itemId: string,
): GeneratedApiHttpResult {
  if (input.method !== 'GET') return methodNotAllowed(['GET'])
  const request = createGeneratedApiRequest(resource)
  request.filters = [{ id: 'id', field: 'id', operator: 'equals', value: itemId }]
  request.limit = 1
  const response = executeGeneratedApiRequest(resource, request, input.db)
  const item = response.data[0]
  if (!item) return json(404, { error: 'Запись не найдена' })
  return json(200, item)
}

function requestFromQuery(resource: GeneratedApiResource, searchParams: URLSearchParams): GeneratedApiRequest {
  const request = createGeneratedApiRequest(resource)
  request.transport = 'query'
  request.logic = parseLogic(searchParams.get('logic'))
  request.sort = searchParams.get('sort') ?? ''
  request.limit = parseNumber(searchParams.get('limit'), request.limit)
  request.offset = parseNumber(searchParams.get('offset'), request.offset)
  request.filters = parseQueryFilters(resource, searchParams)
  return request
}

function requestFromBody(resource: GeneratedApiResource, body: unknown): GeneratedApiRequest {
  const request = createGeneratedApiRequest(resource)
  const source = isRecord(body) ? body : {}
  request.transport = 'body'
  request.logic = parseLogic(source.logic)
  request.sort = typeof source.sort === 'string' ? source.sort : ''
  request.limit = parseNumber(source.limit, request.limit)
  request.offset = parseNumber(source.offset, request.offset)
  request.filters = parseBodyFilters(resource, source.filters)
  return request
}

function parseQueryFilters(resource: GeneratedApiResource, searchParams: URLSearchParams): GeneratedApiFilter[] {
  const filters: GeneratedApiFilter[] = []
  let index = 1

  searchParams.forEach((value, key) => {
    if (['logic', 'sort', 'limit', 'offset'].includes(key)) return

    const nested = key.match(/^filters\[(.+)]\[(.+)]$/)
    if (nested) {
      const [, fieldKey, operatorKey] = nested
      const operator = parseOperator(operatorKey)
      if (!operator || !resolveApiField(resource, fieldKey)) return
      filters.push({ id: `filter_${index}`, field: fieldKey, operator, value })
      index += 1
      return
    }

    const direct = value.match(/^([a-zA-Z]+)\.(.*)$/)
    if (!direct || !resolveApiField(resource, key)) return
    const [, operatorKey, directValue] = direct
    const operator = parseOperator(operatorKey)
    if (!operator) return
    filters.push({ id: `filter_${index}`, field: key, operator, value: directValue })
    index += 1
  })

  return filters
}

function parseBodyFilters(resource: GeneratedApiResource, filters: unknown): GeneratedApiFilter[] {
  if (Array.isArray(filters)) {
    return filters.flatMap((filter, index) => {
      if (!isRecord(filter)) return []
      const field = stringifyValue(filter.field)
      const operator = parseOperator(stringifyValue(filter.operator))
      if (!field || !operator || !resolveApiField(resource, field)) return []
      return [{
        id: stringifyValue(filter.id) || `filter_${index + 1}`,
        field,
        operator,
        value: operatorNeedsValue(operator) ? stringifyValue(filter.value) : '',
      }]
    })
  }

  if (!isRecord(filters)) return []

  let index = 1
  const result: GeneratedApiFilter[] = []
  Object.entries(filters).forEach(([field, condition]) => {
    if (!resolveApiField(resource, field) || !isRecord(condition)) return
    Object.entries(condition).forEach(([operatorKey, value]) => {
      const operator = parseOperator(operatorKey)
      if (!operator) return
      result.push({
        id: `filter_${index}`,
        field,
        operator,
        value: operatorNeedsValue(operator) ? stringifyValue(value) : '',
      })
      index += 1
    })
  })

  return result
}

function findResource(
  pathname: string,
  resources: GeneratedApiResource[],
): { resource: GeneratedApiResource, action: 'list' | 'search' | 'item', itemId: string } | null {
  for (const resource of resources) {
    const basePath = normalizePath(resource.path)
    if (pathname === basePath) return { resource, action: 'list', itemId: '' }
    if (pathname === `${basePath}/search`) return { resource, action: 'search', itemId: '' }
    if (pathname.startsWith(`${basePath}/`)) {
      return { resource, action: 'item', itemId: decodeURIComponent(pathname.slice(basePath.length + 1)) }
    }
  }
  return null
}

function parseOperator(value: string): GeneratedApiOperator | null {
  const normalized = value.trim().replace(/^\$/, '')
  const byCode = queryOperators[normalized] ?? queryOperators[normalized.toLowerCase()]
  if (byCode) return byCode
  return generatedApiOperators.find((operator) => normalizeText(operator.label) === normalizeText(normalized))?.value ?? null
}

function parseLogic(value: unknown): GeneratedApiLogic {
  return value === 'or' ? 'or' : 'and'
}

function parseNumber(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function stringifyValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => stringifyValue(item)).join(',')
  if (value === null || value === undefined) return ''
  return String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function methodNotAllowed(allowed: string[]): GeneratedApiHttpResult {
  return json(405, {
    error: 'Метод не поддерживается',
    allowed,
  })
}

function json(status: number, body: unknown): GeneratedApiHttpResult {
  return { status, body }
}

function normalizePath(pathname: string): string {
  const cleaned = pathname.replace(/\/+$/, '')
  return cleaned || '/'
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replaceAll('ё', 'е')
}
