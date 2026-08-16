export interface ZipArchiveFile {
  name: string
  dataUrl?: string
  blob?: Blob
  date?: string
}

interface PreparedZipFile {
  name: string
  nameBytes: Uint8Array
  bytes: Uint8Array
  crc32: number
  dosTime: number
  dosDate: number
  localHeaderOffset: number
}

const ZIP_UTF8_FLAG = 0x0800

export async function downloadZipArchive(files: ZipArchiveFile[], fileName: string): Promise<void> {
  const zip = await createZipArchive(files)
  const url = URL.createObjectURL(zip)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function createZipArchive(files: ZipArchiveFile[]): Promise<Blob> {
  const encoder = new TextEncoder()
  const usedNames = new Map<string, number>()
  const preparedFiles: PreparedZipFile[] = await Promise.all(files.map(async (file) => {
    const bytes = await zipFileBytes(file)
    const name = uniqueZipFileName(file.name, usedNames)
    const date = file.date ? new Date(file.date) : new Date()
    const { dosTime, dosDate } = toDosDateTime(date)
    return {
      name,
      nameBytes: encoder.encode(name),
      bytes,
      crc32: crc32(bytes),
      dosTime,
      dosDate,
      localHeaderOffset: 0,
    }
  }))

  const chunks: Uint8Array[] = []
  let offset = 0

  preparedFiles.forEach((file) => {
    file.localHeaderOffset = offset
    const header = createLocalFileHeader(file)
    chunks.push(header, file.bytes)
    offset += header.byteLength + file.bytes.byteLength
  })

  const centralDirectoryOffset = offset
  preparedFiles.forEach((file) => {
    const header = createCentralDirectoryHeader(file)
    chunks.push(header)
    offset += header.byteLength
  })
  const centralDirectorySize = offset - centralDirectoryOffset
  chunks.push(createEndOfCentralDirectory(preparedFiles.length, centralDirectorySize, centralDirectoryOffset))

  return new Blob(chunks.map(toArrayBuffer), { type: 'application/zip' })
}

async function zipFileBytes(file: ZipArchiveFile): Promise<Uint8Array> {
  if (file.dataUrl) return dataUrlToBytes(file.dataUrl)
  if (file.blob) return new Uint8Array(await file.blob.arrayBuffer())
  return new Uint8Array()
}

function createLocalFileHeader(file: PreparedZipFile): Uint8Array {
  const header = new Uint8Array(30 + file.nameBytes.byteLength)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, ZIP_UTF8_FLAG, true)
  view.setUint16(8, 0, true)
  view.setUint16(10, file.dosTime, true)
  view.setUint16(12, file.dosDate, true)
  view.setUint32(14, file.crc32, true)
  view.setUint32(18, file.bytes.byteLength, true)
  view.setUint32(22, file.bytes.byteLength, true)
  view.setUint16(26, file.nameBytes.byteLength, true)
  view.setUint16(28, 0, true)
  header.set(file.nameBytes, 30)
  return header
}

function createCentralDirectoryHeader(file: PreparedZipFile): Uint8Array {
  const header = new Uint8Array(46 + file.nameBytes.byteLength)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 20, true)
  view.setUint16(8, ZIP_UTF8_FLAG, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, file.dosTime, true)
  view.setUint16(14, file.dosDate, true)
  view.setUint32(16, file.crc32, true)
  view.setUint32(20, file.bytes.byteLength, true)
  view.setUint32(24, file.bytes.byteLength, true)
  view.setUint16(28, file.nameBytes.byteLength, true)
  view.setUint16(30, 0, true)
  view.setUint16(32, 0, true)
  view.setUint16(34, 0, true)
  view.setUint16(36, 0, true)
  view.setUint32(38, 0, true)
  view.setUint32(42, file.localHeaderOffset, true)
  header.set(file.nameBytes, 46)
  return header
}

function createEndOfCentralDirectory(fileCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array {
  const header = new Uint8Array(22)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(4, 0, true)
  view.setUint16(6, 0, true)
  view.setUint16(8, fileCount, true)
  view.setUint16(10, fileCount, true)
  view.setUint32(12, centralDirectorySize, true)
  view.setUint32(16, centralDirectoryOffset, true)
  view.setUint16(20, 0, true)
  return header
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const [, base64] = dataUrl.split(',')
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function uniqueZipFileName(name: string, usedNames: Map<string, number>): string {
  const normalized = normalizeZipFileName(name)
  const usedCount = usedNames.get(normalized) ?? 0
  usedNames.set(normalized, usedCount + 1)
  if (usedCount === 0) return normalized

  const dotIndex = normalized.lastIndexOf('.')
  if (dotIndex <= 0) return `${normalized} (${usedCount + 1})`
  return `${normalized.slice(0, dotIndex)} (${usedCount + 1})${normalized.slice(dotIndex)}`
}

function normalizeZipFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    || 'document'
}

function toDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  const year = Math.min(Math.max(safeDate.getFullYear(), 1980), 2107)
  return {
    dosTime: (safeDate.getHours() << 11) | (safeDate.getMinutes() << 5) | Math.floor(safeDate.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((safeDate.getMonth() + 1) << 5) | safeDate.getDate(),
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
