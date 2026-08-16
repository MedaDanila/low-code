import type { ObjectValue } from '../types/domain'

const STORAGE_KEY = 'low-code-gis-platform-db-v1'
const DEFAULT_DATE_TIME_FORMAT = 'dd.MM.yyyy HH:mm'

export function formatDate(value: ObjectValue): string {
  if (typeof value !== 'string' || !value) return '—'
  return formatDateByTemplate(new Date(value), dateTemplateFromSettings())
}

export function formatDateTime(value: string): string {
  if (!value) return '—'
  return formatDateByTemplate(new Date(value), platformDateTimeFormat())
}

export function formatValue(value: ObjectValue): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  return String(value)
}

function platformDateTimeFormat(): string {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DATE_TIME_FORMAT
    const parsed = JSON.parse(raw) as { settings?: { dateTimeFormat?: string } }
    return parsed.settings?.dateTimeFormat || DEFAULT_DATE_TIME_FORMAT
  } catch {
    return DEFAULT_DATE_TIME_FORMAT
  }
}

function dateTemplateFromSettings(): string {
  return platformDateTimeFormat()
    .replace(/[,\s]*H{1,2}:m{1,2}(:s{1,2})?/g, '')
    .trim()
}

function formatDateByTemplate(date: Date, format: string): string {
  if (Number.isNaN(date.getTime())) return '—'
  const replacements: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    yy: String(date.getFullYear()).slice(-2),
    MMMM: formatRussianMonthGenitive(date),
    MM: padDatePart(date.getMonth() + 1),
    dd: padDatePart(date.getDate()),
    d: String(date.getDate()),
    HH: padDatePart(date.getHours()),
    mm: padDatePart(date.getMinutes()),
  }
  return format.replace(/yyyy|yy|MMMM|MM|dd|d|HH|mm/g, (token) => replacements[token] ?? token)
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

function formatRussianMonthGenitive(date: Date): string {
  const parts = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).formatToParts(date)
  return parts.find((part) => part.type === 'month')?.value ?? ''
}
