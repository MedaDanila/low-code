import { formatDate, formatDateTime } from './format'
import { MAP_CONFIG } from '../config/map'
import type { Coordinates, DomainGeometry } from '../types/domain'

export type ReportSortOrder = 'newest' | 'oldest'

export interface EntityReportRow {
  label: string
  value: string
}

export interface EntityReportAttachment {
  id: string
  name: string
  type: string
  date: string
  author: string
  size: string
  mimeType?: string
  dataUrl?: string
}

export interface EntityReportInput {
  title: string
  subtitle: string
  mainRows: EntityReportRow[]
  geometry?: DomainGeometry
  photos: EntityReportAttachment[]
  includePhotos: boolean
  photoSortOrder: ReportSortOrder
}

const PAGE_WIDTH = 1240
const PAGE_HEIGHT = 1754
const PDF_WIDTH = 595
const PDF_HEIGHT = 842
const PAGE_PADDING = 72
const LINE_HEIGHT = 30
const PHOTO_GRID_GAP = 24
const PHOTO_CARD_MIN_WIDTH = 480
const PHOTO_CARD_MAX_COLUMNS = 2
const PHOTO_CARD_HEIGHT = 462
const PHOTO_CARD_PADDING = 14
const PHOTO_PREVIEW_HEIGHT = 352

type ReportSegment =
  | { type: 'imagePage'; bytes: Uint8Array }
  | { type: 'pdf'; bytes: Uint8Array; document: EntityReportAttachment }
  | { type: 'embeddedFile'; name: string; mimeType: string; bytes: Uint8Array }

export async function downloadEntityReport(input: EntityReportInput, fileName: string): Promise<void> {
  const pdf = await createEntityReportPdf(input)
  const url = URL.createObjectURL(pdf)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function createEntityReportPdf(input: EntityReportInput): Promise<Blob> {
  const renderer = new CanvasReportRenderer(input)
  const segments = await renderer.render()
  return buildPdfFromSegments(segments)
}

class CanvasReportRenderer {
  private canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D
  private y = PAGE_PADDING
  private pageHasContent = false
  private segments: ReportSegment[] = []
  private readonly input: EntityReportInput

  constructor(input: EntityReportInput) {
    this.input = input
    this.canvas.width = PAGE_WIDTH
    this.canvas.height = PAGE_HEIGHT
    const context = this.canvas.getContext('2d')
    if (!context) throw new Error('Не удалось подготовить PDF-отчёт')
    this.ctx = context
    this.startPage()
  }

  async render(): Promise<ReportSegment[]> {
    this.drawTitle(this.input.title, this.input.subtitle)
    this.drawSection('Основная информация')
    this.input.mainRows.forEach((row) => this.drawInfoRow(row.label, row.value))
    this.startSectionPage()
    await this.drawMapSection(this.input.geometry)

    if (this.input.includePhotos) {
      this.startSectionPage()
      this.drawSection('Фото')
      await this.drawPhotos(sortAttachments(this.input.photos, this.input.photoSortOrder))
    }

    this.flushPage()
    return this.segments
  }

  private startPage(): void {
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
    this.ctx.fillStyle = '#0f172a'
    this.y = PAGE_PADDING
    this.pageHasContent = false
  }

  private flushPage(): void {
    if (!this.pageHasContent) return
    const dataUrl = this.canvas.toDataURL('image/jpeg', 0.92)
    this.segments.push({ type: 'imagePage', bytes: dataUrlToBytes(dataUrl) })
    this.pageHasContent = false
  }

  private nextPage(): void {
    this.flushPage()
    this.startPage()
  }

  private startSectionPage(): void {
    if (this.pageHasContent) this.nextPage()
  }

  private ensureSpace(height: number): void {
    if (this.y + height <= PAGE_HEIGHT - PAGE_PADDING) return
    this.nextPage()
  }

  private drawTitle(title: string, subtitle: string): void {
    this.pageHasContent = true
    this.ctx.fillStyle = '#0f172a'
    this.ctx.font = '700 36px system-ui, sans-serif'
    this.drawWrappedText(title, PAGE_PADDING, this.y, PAGE_WIDTH - PAGE_PADDING * 2, 42)
    this.y += 54
    this.ctx.fillStyle = '#64748b'
    this.ctx.font = '400 22px system-ui, sans-serif'
    this.drawWrappedText(subtitle, PAGE_PADDING, this.y, PAGE_WIDTH - PAGE_PADDING * 2, 30)
    this.y += 52
  }

  private drawSection(title: string): void {
    this.ensureSpace(70)
    this.pageHasContent = true
    this.y += 18
    this.ctx.fillStyle = '#0f172a'
    this.ctx.font = '700 26px system-ui, sans-serif'
    this.ctx.fillText(title, PAGE_PADDING, this.y)
    this.y += 20
    this.ctx.strokeStyle = '#e2e8f0'
    this.ctx.lineWidth = 2
    this.ctx.beginPath()
    this.ctx.moveTo(PAGE_PADDING, this.y)
    this.ctx.lineTo(PAGE_WIDTH - PAGE_PADDING, this.y)
    this.ctx.stroke()
    this.y += 28
  }

  private drawInfoRow(label: string, value: string): void {
    const rowHeight = this.measureWrappedText(value, 760, LINE_HEIGHT) + 26
    this.ensureSpace(Math.max(58, rowHeight))
    this.pageHasContent = true
    this.ctx.fillStyle = '#64748b'
    this.ctx.font = '500 20px system-ui, sans-serif'
    this.ctx.fillText(label, PAGE_PADDING, this.y)
    this.ctx.fillStyle = '#0f172a'
    this.ctx.font = '600 21px system-ui, sans-serif'
    const valueHeight = this.drawWrappedText(value || '—', PAGE_PADDING + 330, this.y, 760, LINE_HEIGHT)
    this.y += Math.max(46, valueHeight + 14)
    this.drawDivider()
  }

  private async drawMapSection(geometry?: DomainGeometry): Promise<void> {
    this.drawSection('Карта')
    this.ensureSpace(570)
    this.pageHasContent = true

    const frameX = PAGE_PADDING
    const frameY = this.y
    const frameWidth = PAGE_WIDTH - PAGE_PADDING * 2
    const frameHeight = 470

    this.ctx.fillStyle = '#eef2f7'
    roundRect(this.ctx, frameX, frameY, frameWidth, frameHeight, 24)
    this.ctx.fill()

    if (!geometry) {
      this.drawMapGrid(frameX, frameY, frameWidth, frameHeight)
      this.ctx.fillStyle = '#64748b'
      this.ctx.font = '500 22px system-ui, sans-serif'
      this.ctx.fillText('Геометрия объекта не указана.', frameX + 34, frameY + frameHeight / 2)
      this.y += frameHeight + 32
      return
    }

    const snapshot = await renderMapSnapshot(geometry, frameWidth, frameHeight)
    this.ctx.save()
    roundRect(this.ctx, frameX, frameY, frameWidth, frameHeight, 24)
    this.ctx.clip()
    this.ctx.drawImage(snapshot.canvas, frameX, frameY, frameWidth, frameHeight)
    this.ctx.restore()

    this.ctx.strokeStyle = '#cbd5e1'
    this.ctx.lineWidth = 2
    roundRect(this.ctx, frameX, frameY, frameWidth, frameHeight, 24)
    this.ctx.stroke()

    const projector = (coordinate: Coordinates): Coordinates => {
      const [x, y] = snapshot.project(coordinate)
      return [frameX + x, frameY + y]
    }
    this.ctx.lineJoin = 'round'
    this.ctx.lineCap = 'round'

    if (geometry.type === 'Polygon') {
      geometry.coordinates.forEach((ring, ringIndex) => {
        this.drawProjectedPath(ring.map(projector), ringIndex === 0)
        if (ringIndex === 0) {
          this.ctx.fillStyle = 'rgba(59, 130, 246, 0.18)'
          this.ctx.fill()
        }
        this.ctx.strokeStyle = '#2563eb'
        this.ctx.lineWidth = 5
        this.ctx.stroke()
      })
    } else if (geometry.type === 'LineString') {
      this.drawProjectedPath(geometry.coordinates.map(projector), false)
      this.ctx.strokeStyle = '#2563eb'
      this.ctx.lineWidth = 7
      this.ctx.stroke()
    } else {
      const point = projector(geometry.coordinates)
      this.ctx.fillStyle = 'rgba(37, 99, 235, 0.16)'
      this.ctx.beginPath()
      this.ctx.arc(point[0], point[1], 30, 0, Math.PI * 2)
      this.ctx.fill()
      this.ctx.fillStyle = '#2563eb'
      this.ctx.beginPath()
      this.ctx.arc(point[0], point[1], 14, 0, Math.PI * 2)
      this.ctx.fill()
      this.ctx.strokeStyle = '#ffffff'
      this.ctx.lineWidth = 5
      this.ctx.stroke()
    }

    this.y += frameHeight + 32
  }

  private drawMapGrid(x: number, y: number, width: number, height: number): void {
    this.ctx.strokeStyle = '#e2e8f0'
    this.ctx.lineWidth = 1
    for (let index = 1; index < 5; index += 1) {
      const gx = x + (width / 5) * index
      const gy = y + (height / 5) * index
      this.ctx.beginPath()
      this.ctx.moveTo(gx, y)
      this.ctx.lineTo(gx, y + height)
      this.ctx.stroke()
      this.ctx.beginPath()
      this.ctx.moveTo(x, gy)
      this.ctx.lineTo(x + width, gy)
      this.ctx.stroke()
    }
  }

  private drawProjectedPath(points: Coordinates[], closePath: boolean): void {
    if (points.length === 0) return
    this.ctx.beginPath()
    this.ctx.moveTo(points[0][0], points[0][1])
    points.slice(1).forEach((point) => this.ctx.lineTo(point[0], point[1]))
    if (closePath) this.ctx.closePath()
  }

  private async drawPhotos(photos: EntityReportAttachment[]): Promise<void> {
    if (photos.length === 0) {
      this.drawEmpty('Фотографии не добавлены.')
      return
    }

    let currentDate = ''
    let row: Array<{ photo: EntityReportAttachment; image?: HTMLImageElement }> = []
    const columns = this.photoGridColumns()

    const flushRow = (): void => {
      if (row.length === 0) return
      this.drawPhotoGridRow(row, columns)
      row = []
    }

    for (const photo of photos) {
      const dateLabel = formatDate(photo.date)
      if (currentDate !== dateLabel) {
        flushRow()
        currentDate = dateLabel
        this.ensureSpace(50 + PHOTO_CARD_HEIGHT)
        this.ctx.fillStyle = '#334155'
        this.ctx.font = '700 21px system-ui, sans-serif'
        this.ctx.fillText(currentDate, PAGE_PADDING, this.y)
        this.y += 26
      }

      row.push({
        photo,
        image: photo.dataUrl ? await loadImage(photo.dataUrl).catch(() => undefined) : undefined,
      })
      if (row.length === columns) flushRow()
    }
    flushRow()
  }

  private photoGridColumns(): number {
    const availableWidth = PAGE_WIDTH - PAGE_PADDING * 2
    const columns = Math.floor((availableWidth + PHOTO_GRID_GAP) / (PHOTO_CARD_MIN_WIDTH + PHOTO_GRID_GAP))
    return Math.max(1, Math.min(PHOTO_CARD_MAX_COLUMNS, columns))
  }

  private drawPhotoGridRow(
    row: Array<{ photo: EntityReportAttachment; image?: HTMLImageElement }>,
    columns: number,
  ): void {
    this.ensureSpace(PHOTO_CARD_HEIGHT + 22)
    this.pageHasContent = true
    const availableWidth = PAGE_WIDTH - PAGE_PADDING * 2
    const cardWidth = (availableWidth - PHOTO_GRID_GAP * (columns - 1)) / columns

    row.forEach((item, index) => {
      const x = PAGE_PADDING + index * (cardWidth + PHOTO_GRID_GAP)
      this.drawPhotoCard(item.photo, item.image, x, this.y, cardWidth)
    })

    this.y += PHOTO_CARD_HEIGHT + 22
  }

  private drawPhotoCard(
    photo: EntityReportAttachment,
    image: HTMLImageElement | undefined,
    x: number,
    y: number,
    width: number,
  ): void {
    this.ctx.fillStyle = '#ffffff'
    roundRect(this.ctx, x, y, width, PHOTO_CARD_HEIGHT, 18)
    this.ctx.fill()
    this.ctx.strokeStyle = '#e2e8f0'
    this.ctx.lineWidth = 2
    roundRect(this.ctx, x, y, width, PHOTO_CARD_HEIGHT, 18)
    this.ctx.stroke()

    const previewX = x + PHOTO_CARD_PADDING
    const previewY = y + PHOTO_CARD_PADDING
    const previewWidth = width - PHOTO_CARD_PADDING * 2
    this.ctx.fillStyle = '#f8fafc'
    roundRect(this.ctx, previewX, previewY, previewWidth, PHOTO_PREVIEW_HEIGHT, 14)
    this.ctx.fill()

    if (image) {
      const scale = Math.min(previewWidth / image.width, PHOTO_PREVIEW_HEIGHT / image.height)
      const imageWidth = image.width * scale
      const imageHeight = image.height * scale
      const imageX = previewX + (previewWidth - imageWidth) / 2
      const imageY = previewY + (PHOTO_PREVIEW_HEIGHT - imageHeight) / 2
      this.ctx.save()
      roundRect(this.ctx, previewX, previewY, previewWidth, PHOTO_PREVIEW_HEIGHT, 14)
      this.ctx.clip()
      this.ctx.drawImage(image, imageX, imageY, imageWidth, imageHeight)
      this.ctx.restore()
    } else {
      this.ctx.fillStyle = '#94a3b8'
      this.ctx.font = '500 16px system-ui, sans-serif'
      drawCanvasSingleLine(this.ctx, 'Фото недоступно', previewX + 18, previewY + PHOTO_PREVIEW_HEIGHT / 2, previewWidth - 36)
    }

    const captionX = x + PHOTO_CARD_PADDING
    const captionY = y + PHOTO_CARD_PADDING + PHOTO_PREVIEW_HEIGHT + 30
    const captionWidth = width - PHOTO_CARD_PADDING * 2
    this.ctx.fillStyle = '#0f172a'
    this.ctx.font = '700 16px system-ui, sans-serif'
    drawCanvasSingleLine(this.ctx, photo.name, captionX, captionY, captionWidth)
    this.ctx.fillStyle = '#64748b'
    this.ctx.font = '400 13px system-ui, sans-serif'
    drawCanvasSingleLine(this.ctx, `${formatDateTime(photo.date)} · ${photo.author}`, captionX, captionY + 24, captionWidth)
  }

  private drawEmpty(text: string): void {
    this.ensureSpace(44)
    this.pageHasContent = true
    this.ctx.fillStyle = '#64748b'
    this.ctx.font = '400 20px system-ui, sans-serif'
    this.ctx.fillText(text, PAGE_PADDING, this.y)
    this.y += 38
  }

  private drawDivider(): void {
    this.ctx.strokeStyle = '#e2e8f0'
    this.ctx.lineWidth = 1
    this.ctx.beginPath()
    this.ctx.moveTo(PAGE_PADDING, this.y)
    this.ctx.lineTo(PAGE_WIDTH - PAGE_PADDING, this.y)
    this.ctx.stroke()
    this.y += 18
  }

  private drawWrappedText(text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
    const lines = this.wrapTextLines(text, maxWidth)
    lines.forEach((line, index) => this.ctx.fillText(line, x, y + index * lineHeight))
    return Math.max(1, lines.length) * lineHeight
  }

  private measureWrappedText(text: string, maxWidth: number, lineHeight: number): number {
    return this.wrapTextLines(text, maxWidth).length * lineHeight
  }

  private wrapTextLines(text: string, maxWidth: number): string[] {
    const words = String(text).split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let line = ''
    words.forEach((word) => {
      this.splitLongWord(word, maxWidth).forEach((piece) => {
        const testLine = line ? `${line} ${piece}` : piece
        if (this.ctx.measureText(testLine).width > maxWidth && line) {
          lines.push(line)
          line = piece
        } else {
          line = testLine
        }
      })
    })
    if (line) lines.push(line)
    return lines.length > 0 ? lines : ['']
  }

  private splitLongWord(word: string, maxWidth: number): string[] {
    if (this.ctx.measureText(word).width <= maxWidth) return [word]
    const chunks: string[] = []
    let chunk = ''
    Array.from(word).forEach((char) => {
      const testChunk = `${chunk}${char}`
      if (this.ctx.measureText(testChunk).width > maxWidth && chunk) {
        chunks.push(chunk)
        chunk = char
      } else {
        chunk = testChunk
      }
    })
    if (chunk) chunks.push(chunk)
    return chunks
  }
}

function sortAttachments(attachments: EntityReportAttachment[], order: ReportSortOrder): EntityReportAttachment[] {
  return [...attachments].sort((a, b) => {
    const difference = Date.parse(b.date) - Date.parse(a.date)
    return order === 'newest' ? difference : -difference
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
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

interface MapSnapshot {
  canvas: HTMLCanvasElement
  project: (coordinate: Coordinates) => Coordinates
}

const TILE_SIZE = 256

async function renderMapSnapshot(geometry: DomainGeometry, width: number, height: number): Promise<MapSnapshot> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width)
  canvas.height = Math.round(height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Не удалось подготовить снимок карты.')

  context.fillStyle = '#e5e7eb'
  context.fillRect(0, 0, width, height)

  const zoom = chooseMapZoom(geometry, width, height)
  const center = geometryCenter(geometry)
  const centerPixel = lonLatToGlobalPixel(center, zoom)
  const topLeft: Coordinates = [centerPixel[0] - width / 2, centerPixel[1] - height / 2]
  const tileMinX = Math.floor(topLeft[0] / TILE_SIZE)
  const tileMaxX = Math.floor((topLeft[0] + width) / TILE_SIZE)
  const tileMinY = Math.floor(topLeft[1] / TILE_SIZE)
  const tileMaxY = Math.floor((topLeft[1] + height) / TILE_SIZE)
  const tileCount = 2 ** zoom
  const tileJobs: Promise<void>[] = []

  for (let tileX = tileMinX; tileX <= tileMaxX; tileX += 1) {
    for (let tileY = tileMinY; tileY <= tileMaxY; tileY += 1) {
      if (tileY < 0 || tileY >= tileCount) continue
      const wrappedTileX = ((tileX % tileCount) + tileCount) % tileCount
      const url = MAP_CONFIG.tileUrl
        .replace('{a-c}', 'a')
        .replace('{z}', String(zoom))
        .replace('{x}', String(wrappedTileX))
        .replace('{y}', String(tileY))
      const drawX = Math.round(tileX * TILE_SIZE - topLeft[0])
      const drawY = Math.round(tileY * TILE_SIZE - topLeft[1])
      tileJobs.push(
        loadImage(url)
          .then((image) => {
            context.drawImage(image, drawX, drawY, TILE_SIZE, TILE_SIZE)
          })
          .catch(() => {
            context.fillStyle = '#f8fafc'
            context.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE)
          }),
      )
    }
  }

  await Promise.all(tileJobs)

  return {
    canvas,
    project: (coordinate: Coordinates) => {
      const pixel = lonLatToGlobalPixel(coordinate, zoom)
      return [pixel[0] - topLeft[0], pixel[1] - topLeft[1]]
    },
  }
}

function chooseMapZoom(geometry: DomainGeometry, width: number, height: number): number {
  const points = flattenGeometryCoordinates(geometry)
  const longitudes = points.map((point) => point[0])
  const latitudes = points.map((point) => point[1])
  let minLon = Math.min(...longitudes)
  let maxLon = Math.max(...longitudes)
  let minLat = Math.min(...latitudes)
  let maxLat = Math.max(...latitudes)

  if (minLon === maxLon && minLat === maxLat) return 17

  minLon -= (maxLon - minLon) * 0.16
  maxLon += (maxLon - minLon) * 0.16
  minLat -= (maxLat - minLat) * 0.16
  maxLat += (maxLat - minLat) * 0.16

  for (let zoom = 18; zoom >= 3; zoom -= 1) {
    const topLeft = lonLatToGlobalPixel([minLon, maxLat], zoom)
    const bottomRight = lonLatToGlobalPixel([maxLon, minLat], zoom)
    if (bottomRight[0] - topLeft[0] <= width * 0.82 && bottomRight[1] - topLeft[1] <= height * 0.78) return zoom
  }

  return 3
}

function flattenGeometryCoordinates(geometry: DomainGeometry): Coordinates[] {
  if (geometry.type === 'Point') return [geometry.coordinates]
  if (geometry.type === 'LineString') return geometry.coordinates
  return geometry.coordinates.flat()
}

function geometryCenter(geometry: DomainGeometry): Coordinates {
  const points = flattenGeometryCoordinates(geometry)
  const sum = points.reduce(
    (accumulator, point) => [accumulator[0] + point[0], accumulator[1] + point[1]] as Coordinates,
    [0, 0],
  )
  return [sum[0] / points.length, sum[1] / points.length]
}

function lonLatToGlobalPixel([lon, lat]: Coordinates, zoom: number): Coordinates {
  const safeLat = Math.max(Math.min(lat, 85.05112878), -85.05112878)
  const sinLat = Math.sin((safeLat * Math.PI) / 180)
  const scale = TILE_SIZE * 2 ** zoom
  return [
    ((lon + 180) / 360) * scale,
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  ]
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function bytesToBinaryString(bytes: Uint8Array): string {
  let output = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    output += String.fromCharCode(...bytes.slice(index, index + chunkSize))
  }
  return output
}

function binaryStringToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff
  }
  return bytes
}

interface PdfObjectRecord {
  id: number
  body: string
}

interface ImportedPdfDocument {
  objects: PdfObjectRecord[]
  pageIds: number[]
  skipIds: Set<number>
}

interface PdfMediaBox {
  llx: number
  lly: number
  urx: number
  ury: number
}

interface ImportedPdfHeader {
  imageObject: number
  contentObject: number
  xObjectName: string
  mediaBox: PdfMediaBox
  height: number
  resourceObjectId?: number
}

function buildPdfFromSegments(segments: ReportSegment[]): Blob {
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  const objectBodies = new Map<number, string | Uint8Array>()
  const pageRefs: string[] = []
  const embeddedFileRefs: Array<{ name: string; filespecObject: number }> = []
  const attachmentAnnotationRefs: string[] = []
  let nextObjectId = 3
  let position = 0

  function push(chunk: string | Uint8Array): void {
    const bytes = typeof chunk === 'string' ? binaryStringToBytes(chunk) : chunk
    chunks.push(bytes)
    position += bytes.byteLength
  }

  function writeObject(id: number, body: string | Uint8Array): void {
    offsets[id] = position
    push(`${id} 0 obj\n`)
    push(body)
    push('\nendobj\n')
  }

  for (const segment of segments) {
    if (segment.type === 'imagePage') {
      const pageObject = nextObjectId
      const imageObject = nextObjectId + 1
      const contentObject = nextObjectId + 2
      nextObjectId += 3
      const content = `q\n${PDF_WIDTH} 0 0 ${PDF_HEIGHT} 0 0 cm\n/Im1 Do\nQ\n`
      objectBodies.set(
        pageObject,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /XObject << /Im1 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`,
      )
      objectBodies.set(
        imageObject,
        createJpegXObjectBody(segment.bytes, PAGE_WIDTH, PAGE_HEIGHT),
      )
      objectBodies.set(contentObject, `<< /Length ${content.length} >>\nstream\n${content}endstream`)
      pageRefs.push(`${pageObject} 0 R`)
      continue
    }

    if (segment.type === 'embeddedFile') {
      const fileStreamObject = nextObjectId
      const filespecObject = nextObjectId + 1
      nextObjectId += 2
      objectBodies.set(
        fileStreamObject,
        concatBytes(
          binaryStringToBytes(`<< /Type /EmbeddedFile /Subtype /${pdfName(segment.mimeType)} /Length ${segment.bytes.byteLength} >>\nstream\n`),
          segment.bytes,
          binaryStringToBytes('\nendstream'),
        ),
      )
      objectBodies.set(
        filespecObject,
        `<< /Type /Filespec /F (${escapePdfString(asciiFileName(segment.name))}) /UF <${textToUtf16BeHex(segment.name)}> /AFRelationship /Data /EF << /F ${fileStreamObject} 0 R >> >>`,
      )
      embeddedFileRefs.push({ name: segment.name, filespecObject })
      continue
    }

    const imported = parseImportedPdf(segment.bytes)
    const idMap = new Map<number, number>()
    imported.objects.forEach((object) => {
      if (!imported.skipIds.has(object.id)) {
        idMap.set(object.id, nextObjectId)
        nextObjectId += 1
      }
    })

    const firstPageId = imported.pageIds[0]
    const firstPageObject = imported.objects.find((object) => object.id === firstPageId)
    const firstPageNewId = firstPageId ? idMap.get(firstPageId) : undefined
    const documentHeader = firstPageObject && firstPageNewId
      ? createImportedPdfHeader(firstPageObject.body, firstPageNewId, nextObjectId)
      : undefined
    if (documentHeader) {
      nextObjectId += 2
      const image = createHeaderImage(
        segment.document,
        documentHeader.mediaBox.urx - documentHeader.mediaBox.llx,
        documentHeader.height,
      )
      objectBodies.set(documentHeader.imageObject, createJpegXObjectBody(image.bytes, image.width, image.height))
      objectBodies.set(documentHeader.contentObject, createImportedPdfHeaderContent(documentHeader))
    }

    imported.objects.forEach((object) => {
      const newId = idMap.get(object.id)
      if (!newId) return
      const isPage = imported.pageIds.includes(object.id)
      const pageHeader = isPage && object.id === firstPageId ? documentHeader : undefined
      const resourceHeader = documentHeader?.resourceObjectId === object.id ? documentHeader : undefined
      objectBodies.set(newId, rewriteImportedPdfObject(object.body, idMap, isPage, pageHeader, resourceHeader))
    })

    imported.pageIds.forEach((pageId) => {
      const newId = idMap.get(pageId)
      if (newId) pageRefs.push(`${newId} 0 R`)
    })
  }

  if (embeddedFileRefs.length > 0 && pageRefs.length > 0) {
    embeddedFileRefs.forEach((file, index) => {
      const annotationObject = nextObjectId
      nextObjectId += 1
      const x = 28 + (index % 12) * 18
      const y = 24 + Math.floor(index / 12) * 18
      objectBodies.set(
        annotationObject,
        `<< /Type /Annot /Subtype /FileAttachment /Rect [${x} ${y} ${x + 14} ${y + 14}] /Contents (${escapePdfString(file.name)}) /Name /Paperclip /FS ${file.filespecObject} 0 R >>`,
      )
      attachmentAnnotationRefs.push(`${annotationObject} 0 R`)
    })
    const firstPageId = Number(pageRefs[0].match(/\d+/)?.[0] ?? 0)
    const firstPageBody = objectBodies.get(firstPageId)
    if (firstPageId && typeof firstPageBody === 'string') {
      objectBodies.set(firstPageId, addPageAnnotations(firstPageBody, attachmentAnnotationRefs))
    }
  }

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const embeddedFiles = embeddedFileRefs.length > 0
    ? ` /Names << /EmbeddedFiles << /Names [${embeddedFileRefs
      .map((file) => `<${textToUtf16BeHex(file.name)}> ${file.filespecObject} 0 R`)
      .join(' ')}] >> >>`
    : ''
  const associatedFiles = embeddedFileRefs.length > 0
    ? ` /AF [${embeddedFileRefs.map((file) => `${file.filespecObject} 0 R`).join(' ')}]`
    : ''
  writeObject(1, `<< /Type /Catalog /Pages 2 0 R${embeddedFiles}${associatedFiles} >>`)
  writeObject(2, `<< /Type /Pages /Count ${pageRefs.length} /Kids [${pageRefs.join(' ')}] >>`)

  for (let id = 3; id < nextObjectId; id += 1) {
    const body = objectBodies.get(id)
    if (body !== undefined) writeObject(id, body)
  }

  const xrefPosition = position
  push(`xref\n0 ${nextObjectId}\n`)
  push('0000000000 65535 f \n')
  for (let id = 1; id < nextObjectId; id += 1) {
    push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  }
  push(`trailer\n<< /Size ${nextObjectId} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`)

  return new Blob(chunks.map((chunk) => toArrayBuffer(chunk)), { type: 'application/pdf' })
}

function parseImportedPdf(bytes: Uint8Array): ImportedPdfDocument {
  const binary = bytesToBinaryString(bytes)
  if (/\/Encrypt\b/.test(binary)) throw new Error('Защищённый PDF нельзя объединить.')
  const objects: PdfObjectRecord[] = []
  const objectMap = new Map<number, string>()
  for (const match of binary.matchAll(/(\d+)\s+0\s+obj\s*([\s\S]*?)\s*endobj/g)) {
    const id = Number(match[1])
    const body = match[2] ?? ''
    objects.push({ id, body })
    objectMap.set(id, body)
  }

  const catalog = objects.find((object) => isPdfCatalogObject(object.body))
  const rootPagesId = Number(catalog?.body.match(/\/Pages\s+(\d+)\s+0\s+R/)?.[1] ?? 0)
  const pageIds = rootPagesId ? collectPdfPageIds(rootPagesId, objectMap, new Set()) : []
  const fallbackPageIds = pageIds.length > 0
    ? pageIds
    : objects.filter((object) => isPdfPageObject(object.body)).map((object) => object.id)

  if (fallbackPageIds.length === 0) {
    throw new Error('В PDF не найдены страницы для объединения.')
  }

  const skipIds = new Set(
    objects
      .filter((object) => isPdfCatalogObject(object.body) || isPdfPagesObject(object.body))
      .map((object) => object.id),
  )
  fallbackPageIds.forEach((id) => skipIds.delete(id))

  return { objects, pageIds: fallbackPageIds, skipIds }
}

function collectPdfPageIds(id: number, objectMap: Map<number, string>, visited: Set<number>): number[] {
  if (visited.has(id)) return []
  visited.add(id)
  const body = objectMap.get(id)
  if (!body) return []
  if (isPdfPageObject(body)) return [id]
  const kidsMatch = body.match(/\/Kids\s*\[([\s\S]*?)\]/)
  if (!kidsMatch) return []
  return Array.from((kidsMatch[1] ?? '').matchAll(/(\d+)\s+0\s+R/g)).flatMap((match) =>
    collectPdfPageIds(Number(match[1]), objectMap, visited),
  )
}

function createImportedPdfHeader(
  pageBody: string,
  pageObjectId: number,
  nextObjectId: number,
): ImportedPdfHeader {
  const mediaBox = readPdfMediaBox(pageBody) ?? { llx: 0, lly: 0, urx: PDF_WIDTH, ury: PDF_HEIGHT }
  return {
    imageObject: nextObjectId,
    contentObject: nextObjectId + 1,
    xObjectName: `DocHeader${pageObjectId}`,
    mediaBox,
    height: 72,
    resourceObjectId: readPdfResourceObjectId(pageBody),
  }
}

function createHeaderImage(
  documentItem: EntityReportAttachment,
  widthPt: number,
  heightPt: number,
): { bytes: Uint8Array; width: number; height: number } {
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(widthPt * scale))
  canvas.height = Math.max(1, Math.round(heightPt * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Не удалось подготовить заголовок документа.')

  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, widthPt, heightPt)
  ctx.fillStyle = '#0f172a'
  ctx.font = '700 14px system-ui, sans-serif'
  drawCanvasSingleLine(ctx, documentItem.name, 18, 28, widthPt - 36)
  ctx.fillStyle = '#64748b'
  ctx.font = '400 9px system-ui, sans-serif'
  drawCanvasSingleLine(
    ctx,
    `${formatDateTime(documentItem.date)} · ${documentItem.author} · ${documentItem.type} · ${documentItem.size}`,
    18,
    48,
    widthPt - 36,
  )
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(18, heightPt - 8)
  ctx.lineTo(widthPt - 18, heightPt - 8)
  ctx.stroke()

  return { bytes: dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92)), width: canvas.width, height: canvas.height }
}

function drawCanvasSingleLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number): void {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y)
    return
  }
  let value = text
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1)
  }
  ctx.fillText(`${value}…`, x, y)
}

function createImportedPdfHeaderContent(header: ImportedPdfHeader): string {
  const width = header.mediaBox.urx - header.mediaBox.llx
  const content = `q\n${width} 0 0 ${header.height} ${header.mediaBox.llx} ${header.mediaBox.ury} cm\n/${header.xObjectName} Do\nQ\n`
  return `<< /Length ${content.length} >>\nstream\n${content}endstream`
}

function createJpegXObjectBody(bytes: Uint8Array, width: number, height: number): Uint8Array {
  return concatBytes(
    binaryStringToBytes(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.byteLength} >>\nstream\n`),
    bytes,
    binaryStringToBytes('\nendstream'),
  )
}

function rewriteImportedPdfObject(
  body: string,
  idMap: Map<number, number>,
  isPage: boolean,
  pageHeader?: ImportedPdfHeader,
  resourceHeader?: ImportedPdfHeader,
): string {
  let rewritten = replacePdfRefsOutsideStreams(body, idMap)
  if (isPage) {
    if (/\/Parent\s+\d+\s+0\s+R/.test(rewritten)) {
      rewritten = rewritten.replace(/\/Parent\s+\d+\s+0\s+R/, '/Parent 2 0 R')
    } else {
      rewritten = rewritten.replace('>>', '/Parent 2 0 R >>')
    }
    if (pageHeader) {
      rewritten = expandPdfPageBox(rewritten, 'MediaBox', pageHeader.height, pageHeader.mediaBox)
      rewritten = expandPdfPageBox(rewritten, 'CropBox', pageHeader.height, pageHeader.mediaBox)
      rewritten = addImportedPdfHeaderContent(rewritten, pageHeader.contentObject)
      if (!pageHeader.resourceObjectId) {
        rewritten = addImportedPdfHeaderResource(rewritten, pageHeader)
      }
    }
  }
  if (resourceHeader) {
    rewritten = addImportedPdfHeaderResourceToDictionary(rewritten, resourceHeader)
  }
  return rewritten
}

function readPdfMediaBox(body: string): PdfMediaBox | undefined {
  const match = body.match(/\/MediaBox\s*\[\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\]/)
  if (!match) return undefined
  return {
    llx: Number(match[1]),
    lly: Number(match[2]),
    urx: Number(match[3]),
    ury: Number(match[4]),
  }
}

function readPdfResourceObjectId(body: string): number | undefined {
  const match = body.match(/\/Resources\s+(\d+)\s+0\s+R/)
  return match ? Number(match[1]) : undefined
}

function expandPdfPageBox(body: string, boxName: 'MediaBox' | 'CropBox', headerHeight: number, fallback: PdfMediaBox): string {
  const pattern = new RegExp(`/${boxName}\\s*\\[\\s*(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s*\\]`)
  if (!pattern.test(body)) {
    if (boxName === 'CropBox') return body
    return body.replace('>>', `/MediaBox [${fallback.llx} ${fallback.lly} ${fallback.urx} ${fallback.ury + headerHeight}] >>`)
  }
  return body.replace(pattern, (_match, llx: string, lly: string, urx: string, ury: string) =>
    `/${boxName} [${llx} ${lly} ${urx} ${Number(ury) + headerHeight}]`,
  )
}

function addImportedPdfHeaderContent(body: string, contentObject: number): string {
  const contentsMatch = body.match(/\/Contents\s+(\d+\s+0\s+R|\[[^\]]+\])/)
  if (!contentsMatch) return body.replace('>>', `/Contents ${contentObject} 0 R >>`)
  return body.replace(contentsMatch[0], `/Contents [${contentObject} 0 R ${contentsMatch[1]}]`)
}

function addImportedPdfHeaderResource(body: string, header: ImportedPdfHeader): string {
  const resourcesIndex = body.search(/\/Resources\b/)
  if (resourcesIndex === -1) {
    return appendToPdfDictionary(body, `/Resources << /XObject << /${header.xObjectName} ${header.imageObject} 0 R >> >>`)
  }

  const afterResources = body.slice(resourcesIndex).match(/^\/Resources\s*/)
  const valueStart = resourcesIndex + (afterResources?.[0].length ?? '/Resources'.length)
  if (body.slice(valueStart).match(/^\d+\s+0\s+R/)) return body
  if (!body.startsWith('<<', valueStart)) return body

  const resourceEnd = findMatchingPdfDictionaryEnd(body, valueStart)
  if (resourceEnd === -1) return body

  const resourceDictionary = body.slice(valueStart, resourceEnd)
  const updatedDictionary = addImportedPdfHeaderResourceToDictionary(resourceDictionary, header)
  return `${body.slice(0, valueStart)}${updatedDictionary}${body.slice(resourceEnd)}`
}

function addImportedPdfHeaderResourceToDictionary(body: string, header: ImportedPdfHeader): string {
  const xObjectIndex = body.search(/\/XObject\s*<</)
  if (xObjectIndex !== -1) {
    const xObjectStart = body.indexOf('<<', xObjectIndex)
    if (xObjectStart !== -1) {
      return `${body.slice(0, xObjectStart + 2)} /${header.xObjectName} ${header.imageObject} 0 R${body.slice(xObjectStart + 2)}`
    }
  }
  return appendToPdfDictionary(body, `/XObject << /${header.xObjectName} ${header.imageObject} 0 R >>`)
}

function appendToPdfDictionary(body: string, addition: string): string {
  const dictionaryStart = body.indexOf('<<')
  if (dictionaryStart === -1) return body
  const dictionaryEnd = findMatchingPdfDictionaryEnd(body, dictionaryStart)
  if (dictionaryEnd === -1) return body
  return `${body.slice(0, dictionaryEnd - 2)} ${addition} ${body.slice(dictionaryEnd - 2)}`
}

function findMatchingPdfDictionaryEnd(body: string, dictionaryStart: number): number {
  let depth = 0
  for (let index = dictionaryStart; index < body.length - 1; index += 1) {
    const token = body.slice(index, index + 2)
    if (token === '<<') {
      depth += 1
      index += 1
      continue
    }
    if (token === '>>') {
      depth -= 1
      index += 1
      if (depth === 0) return index + 1
    }
  }
  return -1
}

function replacePdfRefsOutsideStreams(body: string, idMap: Map<number, number>): string {
  const streamPattern = /(stream\r?\n[\s\S]*?\r?\n?endstream)/g
  return body
    .split(streamPattern)
    .map((part, index) => {
      if (index % 2 === 1) return part
      return part.replace(/\b(\d+)\s+0\s+R\b/g, (match, id: string) => {
        const newId = idMap.get(Number(id))
        return newId ? `${newId} 0 R` : match
      })
    })
    .join('')
}

function isPdfCatalogObject(body: string): boolean {
  return /\/Type\s*\/Catalog\b/.test(body)
}

function isPdfPagesObject(body: string): boolean {
  return /\/Type\s*\/Pages\b/.test(body)
}

function isPdfPageObject(body: string): boolean {
  return /\/Type\s*\/Page\b/.test(body) && !isPdfPagesObject(body)
}

function addPageAnnotations(body: string, annotationRefs: string[]): string {
  if (annotationRefs.length === 0) return body
  if (/\/Annots\s*\[/.test(body)) {
    return body.replace(/\/Annots\s*\[/, `/Annots [${annotationRefs.join(' ')} `)
  }
  return body.replace('>>', `/Annots [${annotationRefs.join(' ')}] >>`)
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const output = new Uint8Array(total)
  let offset = 0
  parts.forEach((part) => {
    output.set(part, offset)
    offset += part.byteLength
  })
  return output
}

function pdfName(value: string): string {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0)
      if (/^[A-Za-z0-9_.-]$/.test(char)) return char
      return `#${code.toString(16).padStart(2, '0').toUpperCase()}`
    })
    .join('')
}

function escapePdfString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function asciiFileName(value: string): string {
  const extension = value.match(/\.[A-Za-z0-9]+$/)?.[0] ?? ''
  const base = value
    .replace(/\.[A-Za-z0-9]+$/, '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${base || 'document'}${extension}`
}

function textToUtf16BeHex(value: string): string {
  const bytes: number[] = [0xfe, 0xff]
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    bytes.push((code >> 8) & 0xff, code & 0xff)
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join('')
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
