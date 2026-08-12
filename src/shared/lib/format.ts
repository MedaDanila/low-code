import type { ObjectValue } from '../types/domain'

export function formatDate(value: ObjectValue): string {
  if (typeof value !== 'string' || !value) return '—'
  return new Intl.DateTimeFormat('ru-RU').format(new Date(value))
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatValue(value: ObjectValue): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  return String(value)
}
