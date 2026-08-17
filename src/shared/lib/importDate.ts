import type { FieldType } from '../types/domain'

type ImportDateFieldType = Extract<FieldType, 'date' | 'datetime'>

interface DateParts {
  year: number
  month: number
  day: number
  hours: number
  minutes: number
  seconds: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const EXCEL_SERIAL_EPOCH = Date.UTC(1899, 11, 30)
const MAX_EXCEL_SERIAL_DATE = 2_958_465

export function parseImportedDateValue(rawValue: string, type: ImportDateFieldType): string | null {
  const value = normalizeDateText(rawValue)
  if (!value) return null

  const excelDate = parseExcelSerialDate(value)
  if (excelDate) return formatImportedDate(excelDate, type)

  const parsedParts = parseDateParts(value)
  if (parsedParts) return formatImportedDate(parsedParts, type)

  const timestamp = Date.parse(value)
  if (!Number.isNaN(timestamp)) {
    const date = new Date(timestamp)
    return formatImportedDate({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hours: date.getHours(),
      minutes: date.getMinutes(),
      seconds: date.getSeconds(),
    }, type)
  }

  return null
}

function normalizeDateText(value: string): string {
  const raw = value.trim().replace(/\u00a0/g, ' ')
  if (/^\d+,\d+$/.test(raw)) return raw.replace(',', '.')

  const normalized = value
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s*,\s*/g, ' ')
    .replace(/\s+/g, ' ')
  return normalized
}

function parseExcelSerialDate(value: string): DateParts | null {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null
  const serial = Number(value)
  if (!Number.isFinite(serial) || serial < 1 || serial > MAX_EXCEL_SERIAL_DATE) return null

  const date = new Date(EXCEL_SERIAL_EPOCH + serial * MS_PER_DAY)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hours: date.getUTCHours(),
    minutes: date.getUTCMinutes(),
    seconds: date.getUTCSeconds(),
  }
}

function parseDateParts(value: string): DateParts | null {
  const isoLike = value.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]+(\d{1,2})(?:[:.](\d{1,2}))?(?:[:.](\d{1,2}))?)?/,
  )
  if (isoLike) {
    return createDateParts({
      year: Number(isoLike[1]),
      month: Number(isoLike[2]),
      day: Number(isoLike[3]),
      hours: optionalNumber(isoLike[4]),
      minutes: optionalNumber(isoLike[5]),
      seconds: optionalNumber(isoLike[6]),
    })
  }

  const ruLike = value.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?:[ T]+(\d{1,2})(?:[:.](\d{1,2}))?(?:[:.](\d{1,2}))?)?/,
  )
  if (ruLike) {
    return createDateParts({
      year: normalizeYear(Number(ruLike[3])),
      month: Number(ruLike[2]),
      day: Number(ruLike[1]),
      hours: optionalNumber(ruLike[4]),
      minutes: optionalNumber(ruLike[5]),
      seconds: optionalNumber(ruLike[6]),
    })
  }

  return null
}

function createDateParts(parts: DateParts): DateParts | null {
  const date = new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hours,
    parts.minutes,
    parts.seconds,
  )
  const isValid = date.getFullYear() === parts.year
    && date.getMonth() === parts.month - 1
    && date.getDate() === parts.day
    && date.getHours() === parts.hours
    && date.getMinutes() === parts.minutes
    && date.getSeconds() === parts.seconds

  return isValid ? parts : null
}

function optionalNumber(value: string | undefined): number {
  return value ? Number(value) : 0
}

function normalizeYear(year: number): number {
  if (year >= 100) return year
  return year < 50 ? 2000 + year : 1900 + year
}

function formatImportedDate(parts: DateParts, type: ImportDateFieldType): string {
  const date = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`
  if (type === 'date') return date
  return `${date}T${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
}

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0')
}
