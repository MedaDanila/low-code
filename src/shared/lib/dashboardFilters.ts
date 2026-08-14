import type { DashboardFilter, EntityObject, ObjectValue } from '../types/domain'

export type DashboardFilterFieldKind = 'date' | 'status' | 'enum' | 'boolean' | 'number' | 'text'

export function matchesDashboardFilter(
  object: EntityObject,
  filter: DashboardFilter,
  fieldKind: DashboardFilterFieldKind,
  now = new Date(),
): boolean {
  const value = objectFilterValue(object, filter.fieldCode)

  if (filter.operator === 'filled') return isFilled(value)
  if (filter.operator === 'empty') return !isFilled(value)

  if (filter.operator === 'today') {
    return fieldKind === 'date' && dateKey(value) === localDateKey(now)
  }
  if (filter.operator === 'beforeToday') {
    const currentDate = fieldKind === 'date' ? dateKey(value) : ''
    return Boolean(currentDate) && currentDate < localDateKey(now)
  }
  if (filter.operator === 'afterToday') {
    const currentDate = fieldKind === 'date' ? dateKey(value) : ''
    return Boolean(currentDate) && currentDate > localDateKey(now)
  }

  if (filter.operator === 'before' || filter.operator === 'after') {
    if (fieldKind === 'date') {
      const currentDate = dateKey(value)
      const targetDate = dateKey(filter.value)
      if (!currentDate || !targetDate) return false
      return filter.operator === 'before' ? currentDate < targetDate : currentDate > targetDate
    }

    if (fieldKind === 'number') {
      const currentNumber = finiteNumber(value)
      const targetNumber = finiteNumber(filter.value)
      if (currentNumber === null || targetNumber === null) return false
      return filter.operator === 'before' ? currentNumber < targetNumber : currentNumber > targetNumber
    }

    return false
  }

  if (fieldKind === 'number' && (filter.operator === 'equals' || filter.operator === 'notEquals')) {
    const currentNumber = finiteNumber(value)
    const targetNumber = finiteNumber(filter.value)
    if (currentNumber === null || targetNumber === null) return filter.operator === 'notEquals'
    return filter.operator === 'equals' ? currentNumber === targetNumber : currentNumber !== targetNumber
  }

  const current = normalizeComparable(value)
  const target = filter.value.trim().toLowerCase()
  if (filter.operator === 'equals') return current === target
  if (filter.operator === 'notEquals') return current !== target
  return current.includes(target)
}

function objectFilterValue(object: EntityObject, fieldCode: string): ObjectValue | string | undefined {
  if (fieldCode === '__status') return object.status ?? ''
  if (fieldCode === '__createdAt') return object.createdAt
  if (fieldCode === '__updatedAt') return object.updatedAt
  return object.values[fieldCode]
}

function finiteNumber(value: ObjectValue | string | undefined): number | null {
  if (!isFilled(value) || Array.isArray(value) || typeof value === 'boolean') return null
  const normalized = typeof value === 'string'
    ? value.replace(/[\s\u00a0]/g, '').replace(',', '.')
    : value
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function isFilled(value: ObjectValue | string | undefined): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function normalizeComparable(value: ObjectValue | string | undefined): string {
  if (Array.isArray(value)) return value.join(',').toLowerCase()
  return String(value ?? '').trim().toLowerCase()
}

function dateKey(value: ObjectValue | string | undefined): string {
  if (!isFilled(value)) return ''
  const raw = String(value)
  const isoLike = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (isoLike) return isoLike

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  return localDateKey(parsed)
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
