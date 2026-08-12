export interface ImportedDictionaryItem {
  name: string
  code: string
  active: boolean
}

import { generateSystemCode } from './codegen'

export { generateSystemCode as slugifyCode } from './codegen'

export interface ImportedSpreadsheetColumn {
  index: number
  label: string
  values: string[]
}

export async function readDictionaryItemsFile(file: File): Promise<ImportedDictionaryItem[]> {
  const [column] = await readSpreadsheetColumnsFile(file)
  return columnValuesToItems(column?.values ?? [])
}

export async function readSpreadsheetColumnsFile(file: File): Promise<ImportedSpreadsheetColumn[]> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'xlsx') return rowsToColumns(await parseXlsxRows(await file.arrayBuffer()))
  if (extension === 'csv' || extension === 'tsv' || extension === 'txt') return rowsToColumns(parseDelimitedRows(await file.text()))
  if (extension === 'xls') {
    throw new Error('Формат .xls не поддерживается в браузерном MVP. Сохраните файл как .xlsx или CSV.')
  }
  throw new Error('Поддерживаются файлы .xlsx, .csv и .tsv.')
}

function parseDelimitedRows(text: string): string[][] {
  const delimiter = text.includes('\t') ? '\t' : text.includes(';') ? ';' : ','
  return text
    .split(/\r?\n/)
    .map((line) => splitDelimitedLine(line, delimiter))
    .filter((row) => row.some((cell) => cell.trim()))
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

async function parseXlsxRows(buffer: ArrayBuffer): Promise<string[][]> {
  const files = await unzipXlsx(buffer)
  const sheet = files.get('xl/worksheets/sheet1.xml') ?? firstWorksheet(files)
  if (!sheet) throw new Error('В Excel-файле не найден первый лист.')

  const sharedStrings = parseSharedStrings(files.get('xl/sharedStrings.xml'))
  const sheetDoc = parseXml(sheet)
  return Array.from(sheetDoc.getElementsByTagName('row')).map((row) => {
    const cells: Record<number, string> = {}
    let maxIndex = 0
    Array.from(row.getElementsByTagName('c')).forEach((cell) => {
      const column = (cell.getAttribute('r') ?? '').replace(/\d+/g, '')
      const index = columnNameToIndex(column)
      maxIndex = Math.max(maxIndex, index)
      cells[index] = readCellValue(cell, sharedStrings)
    })
    return Array.from({ length: maxIndex + 1 }, (_, index) => cells[index] ?? '')
  })
}

async function unzipXlsx(buffer: ArrayBuffer): Promise<Map<string, string>> {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const decoder = new TextDecoder()
  const eocdOffset = findEndOfCentralDirectory(view)
  const totalEntries = view.getUint16(eocdOffset + 10, true)
  let pointer = view.getUint32(eocdOffset + 16, true)
  const files = new Map<string, string>()

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(pointer, true) !== 0x02014b50) break
    const method = view.getUint16(pointer + 10, true)
    const compressedSize = view.getUint32(pointer + 20, true)
    const nameLength = view.getUint16(pointer + 28, true)
    const extraLength = view.getUint16(pointer + 30, true)
    const commentLength = view.getUint16(pointer + 32, true)
    const localHeaderOffset = view.getUint32(pointer + 42, true)
    const name = decoder.decode(bytes.slice(pointer + 46, pointer + 46 + nameLength))

    const localNameLength = view.getUint16(localHeaderOffset + 26, true)
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true)
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.slice(dataStart, dataStart + compressedSize)

    if (name.endsWith('.xml') && (name.includes('worksheets/sheet') || name === 'xl/sharedStrings.xml')) {
      const inflated = await inflateZipEntry(compressed, method)
      files.set(name, decoder.decode(inflated))
    }

    pointer += 46 + nameLength + extraLength + commentLength
  }

  return files
}

function findEndOfCentralDirectory(view: DataView): number {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset
  }
  throw new Error('Excel-файл повреждён: не найден central directory.')
}

async function inflateZipEntry(bytes: Uint8Array, method: number): Promise<ArrayBuffer> {
  if (method === 0) return toArrayBuffer(bytes)
  if (method !== 8) throw new Error('Excel-файл использует неподдерживаемое сжатие.')
  if (!('DecompressionStream' in window)) {
    throw new Error('Ваш браузер не поддерживает распаковку .xlsx. Используйте CSV.')
  }
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).arrayBuffer()
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function firstWorksheet(files: Map<string, string>): string | undefined {
  return Array.from(files.entries()).find(([name]) => name.startsWith('xl/worksheets/sheet'))?.[1]
}

function parseSharedStrings(xml?: string): string[] {
  if (!xml) return []
  return Array.from(parseXml(xml).getElementsByTagName('si')).map((item) =>
    Array.from(item.getElementsByTagName('t'))
      .map((text) => text.textContent ?? '')
      .join(''),
  )
}

function readCellValue(cell: Element, sharedStrings: string[]): string {
  const type = cell.getAttribute('t')
  if (type === 'inlineStr') {
    return Array.from(cell.getElementsByTagName('t'))
      .map((text) => text.textContent ?? '')
      .join('')
      .trim()
  }
  const value = cell.getElementsByTagName('v')[0]?.textContent?.trim() ?? ''
  if (type === 's') return sharedStrings[Number(value)] ?? ''
  if (type === 'b') return value === '1' ? 'true' : 'false'
  return value
}

function parseXml(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Не удалось прочитать XML внутри Excel-файла.')
  }
  return document
}

function rowsToColumns(rows: string[][]): ImportedSpreadsheetColumn[] {
  const normalizedRows = rows.filter((row) => row.some((cell) => cell.trim()))
  const maxColumns = Math.max(...normalizedRows.map((row) => row.length), 0)
  return Array.from({ length: maxColumns }, (_, index) => {
    const header = normalizedRows[0]?.[index]?.trim()
    const hasHeader = isColumnHeader(header)
    const values = normalizedRows
      .slice(hasHeader ? 1 : 0)
      .map((row) => row[index]?.trim() ?? '')
      .filter(Boolean)
    const columnName = indexToColumnName(index)
    return {
      index,
      label: header ? `${columnName} — ${header}` : `Колонка ${columnName}`,
      values,
    }
  }).filter((column) => column.values.length > 0)
}

function isColumnHeader(value?: string): boolean {
  const normalized = value?.trim().toLowerCase() ?? ''
  return ['name', 'title', 'value', 'название', 'значение', 'наименование'].includes(normalized)
}

function columnValuesToItems(values: string[]): ImportedDictionaryItem[] {
  return values.map((name) => ({
    name,
    code: generateSystemCode(name),
    active: true,
  }))
}

function columnNameToIndex(columnName: string): number {
  return columnName
    .toUpperCase()
    .split('')
    .reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1
}

function indexToColumnName(index: number): string {
  let value = index + 1
  let name = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}
