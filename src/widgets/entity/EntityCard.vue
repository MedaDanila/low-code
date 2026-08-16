<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import Checkbox from 'primevue/checkbox'
import UiButton from '../../shared/ui/UiButton.vue'
import UiDialog from '../../shared/ui/UiDialog.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTabs from '../../shared/ui/UiTabs.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { formatDate, formatDateTime, formatValue } from '../../shared/lib/format'
import { validateEntityObjectData } from '../../shared/lib/entityObjectValidation'
import { createEntityReportPdf, downloadEntityReport, type EntityReportAttachment, type ReportSortOrder } from '../../shared/lib/pdfReport'
import { downloadZipArchive, type ZipArchiveFile } from '../../shared/lib/zipArchive'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import AuditTimeline from '../audit/AuditTimeline.vue'
import MapCanvas from '../map/MapCanvas.vue'
import EntityPropertyList from './EntityPropertyList.vue'
import type { Attachment, EntityObject, EntitySchema } from '../../shared/types/domain'

type EntityCardTab = 'main' | 'map' | 'documents' | 'history'

const props = defineProps<{
  schema: EntitySchema
  object: EntityObject
  activeTab?: EntityCardTab
}>()

const emit = defineEmits<{
  'update:activeTab': [tab: EntityCardTab]
  edit: [tab: EntityCardTab]
}>()

const toast = useToast()
const auth = useAuthStore()
const platform = usePlatformStore()
const localActiveTab = ref<EntityCardTab>('main')
const fileInput = ref<HTMLInputElement | null>(null)
const reportDialogVisible = ref(false)
const reportIncludePhotos = ref(true)
const reportIncludeDocuments = ref(true)
const reportPhotoSortOrder = ref<ReportSortOrder>('newest')
const reportDocumentSortOrder = ref<ReportSortOrder>('newest')
const selectedReportPhotoIds = ref<string[]>([])
const selectedReportDocumentIds = ref<string[]>([])
const reportPhotoSearch = ref('')
const reportDocumentSearch = ref('')
const reportGenerating = ref(false)

const acceptedAttachmentTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const acceptedAttachmentExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'doc', 'docx']

const tabs = [
  { label: 'Основное', value: 'main' },
  { label: 'Карта', value: 'map' },
  { label: 'Документы', value: 'documents' },
  { label: 'История', value: 'history' },
]
const currentTab = computed<EntityCardTab>({
  get: () => props.activeTab ?? localActiveTab.value,
  set: (tab) => {
    localActiveTab.value = tab
    emit('update:activeTab', tab)
  },
})
const mapHeight = computed(() => currentTab.value === 'map' ? 'calc(100vh - 224px)' : '440px')

const title = computed(() => {
  return String(
    props.object.values.name
    ?? props.object.values.title
    ?? props.object.values.number
    ?? props.object.values.address
    ?? props.object.id,
  )
})

const objectLayers = computed(() => platform.layers.filter((layer) => layer.entityId === props.object.entityId))
const visibleLayerIds = computed(() => objectLayers.value.map((layer) => layer.id))
const dataIssues = computed(() =>
  validateEntityObjectData({
    schema: props.schema,
    dictionaries: platform.dictionaries.filter((dictionary) => dictionary.entityId === props.schema.id),
    values: props.object.values,
    geometry: props.object.geometry,
  }),
)
const hasIncompleteData = computed(() => dataIssues.value.length > 0)
const documents = computed(() => platform.attachmentsByObject(props.schema.id, props.object.id))
const auditEvents = computed(() => platform.auditByObject(props.schema.id, props.object.id))
const documentRows = computed<Record<string, unknown>[]>(() =>
  documents.value.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    date: formatDateTime(attachment.date),
    author: platform.userById(attachment.authorId)?.lastName ?? 'Система',
    size: attachment.size,
    __attachment: attachment,
  })),
)
const photoAttachments = computed(() => documents.value.filter((attachment) => isPhotoAttachment(attachment)))
const fileDocumentAttachments = computed(() => documents.value.filter((attachment) => isDocumentAttachment(attachment)))
const filteredReportPhotos = computed(() => filterReportAttachments(photoAttachments.value, reportPhotoSearch.value))
const filteredReportDocuments = computed(() => filterReportAttachments(fileDocumentAttachments.value, reportDocumentSearch.value))
const selectedReportPhotos = computed(() => {
  if (!reportIncludePhotos.value) return []
  const selectedIds = new Set(selectedReportPhotoIds.value)
  return photoAttachments.value.filter((attachment) => selectedIds.has(attachment.id))
})
const selectedReportDocuments = computed(() => {
  if (!reportIncludeDocuments.value) return []
  const selectedIds = new Set(selectedReportDocumentIds.value)
  return fileDocumentAttachments.value.filter((attachment) => selectedIds.has(attachment.id))
})
const mainReportRows = computed(() =>
  props.schema.fields
    .filter((field) => field.cardVisible)
    .sort((a, b) => a.order - b.order)
    .map((field) => {
      const rawValue = props.object.values[field.code]
      const dictionary = platform.dictionaryById(field.enumId)
      const enumLabel = dictionary?.items.find((item) => item.code === rawValue)?.name
      const value = field.type === 'datetime' && typeof rawValue === 'string'
        ? formatDateTime(rawValue)
        : field.type === 'date'
          ? formatDate(rawValue)
          : String(enumLabel ?? formatValue(rawValue))
      return { label: field.name, value }
    }),
)
const sortOptions: Array<{ label: string; value: ReportSortOrder }> = [
  { label: 'Сначала свежие', value: 'newest' },
  { label: 'Сначала старые', value: 'oldest' },
]

async function uploadAttachments(event: Event): Promise<void> {
  if (!auth.currentUser) return
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  if (files.length === 0) return
  const rejected: string[] = []
  let uploaded = 0

  try {
    for (const file of files) {
      if (!isAllowedAttachmentFile(file)) {
        rejected.push(file.name)
        continue
      }
      const dataUrl = await fileToDataUrl(file)
      await platform.addAttachment(props.schema.id, props.object.id, auth.currentUser.id, {
        name: file.name,
        type: fileExtension(file.name).toUpperCase(),
        mimeType: file.type,
        size: formatFileSize(file.size),
        sizeBytes: file.size,
        dataUrl,
      })
      uploaded += 1
    }

    if (uploaded > 0) {
      toast.add({ severity: 'success', summary: 'Файлы загружены', detail: `${uploaded} шт.`, life: 2400 })
    }
    if (rejected.length > 0) {
      toast.add({
        severity: 'warn',
        summary: 'Часть файлов пропущена',
        detail: 'Разрешены только фото, PDF, DOC и DOCX.',
        life: 3600,
      })
    }
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить файл',
      detail: 'Проверьте размер файла: данные сохраняются в localStorage браузера.',
      life: 4200,
    })
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function generateReport(): Promise<void> {
  reportGenerating.value = true
  try {
    const reportFileName = `Отчёт-${safeFileName(title.value)}.pdf`
    const archiveDocuments = selectedReportDocuments.value.filter(hasAttachmentData)
    const reportInput = {
      title: title.value,
      subtitle: `${props.schema.name} · отчёт сформирован ${formatDateTime(new Date().toISOString())}`,
      mainRows: mainReportRows.value,
      geometry: props.object.geometry,
      photos: toReportAttachments(selectedReportPhotos.value),
      includePhotos: reportIncludePhotos.value,
      photoSortOrder: reportPhotoSortOrder.value,
    }

    if (archiveDocuments.length > 0) {
      const reportPdf = await createEntityReportPdf(reportInput)
      await downloadZipArchive(
        [
          { name: reportFileName, blob: reportPdf, date: new Date().toISOString() },
          ...toZipArchiveFiles(sortAttachmentsByDate(archiveDocuments, reportDocumentSortOrder.value)),
        ],
        `${safeFileName(title.value)}-report-package.zip`,
      )
    } else {
      await downloadEntityReport(reportInput, reportFileName)
    }

    reportDialogVisible.value = false
    toast.add({
      severity: 'success',
      summary: 'Отчёт сформирован',
      detail: archiveDocuments.length > 0 ? 'ZIP с отчётом и документами скачан на компьютер.' : 'PDF скачан на компьютер.',
      life: 2600,
    })
    if (selectedReportDocuments.value.length > archiveDocuments.length) {
      toast.add({
        severity: 'warn',
        summary: 'Часть документов не попала в ZIP',
        detail: 'У выбранных файлов нет сохранённого содержимого.',
        life: 3600,
      })
    }
  } catch {
    toast.add({ severity: 'error', summary: 'Не удалось сформировать отчёт', life: 3200 })
  } finally {
    reportGenerating.value = false
  }
}

function openReportDialog(): void {
  selectedReportPhotoIds.value = photoAttachments.value.map((attachment) => attachment.id)
  selectedReportDocumentIds.value = fileDocumentAttachments.value.map((attachment) => attachment.id)
  reportPhotoSearch.value = ''
  reportDocumentSearch.value = ''
  reportIncludePhotos.value = photoAttachments.value.length > 0
  reportIncludeDocuments.value = fileDocumentAttachments.value.length > 0
  reportDialogVisible.value = true
}

function setReportPhotosEnabled(value: boolean): void {
  reportIncludePhotos.value = value
  selectedReportPhotoIds.value = value ? photoAttachments.value.map((attachment) => attachment.id) : []
}

function setReportDocumentsEnabled(value: boolean): void {
  reportIncludeDocuments.value = value
  selectedReportDocumentIds.value = value ? fileDocumentAttachments.value.map((attachment) => attachment.id) : []
}

function selectVisibleReportPhotos(): void {
  selectedReportPhotoIds.value = mergeIds(selectedReportPhotoIds.value, filteredReportPhotos.value.map((attachment) => attachment.id))
}

function clearVisibleReportPhotos(): void {
  selectedReportPhotoIds.value = removeIds(selectedReportPhotoIds.value, filteredReportPhotos.value.map((attachment) => attachment.id))
}

function selectVisibleReportDocuments(): void {
  selectedReportDocumentIds.value = mergeIds(selectedReportDocumentIds.value, filteredReportDocuments.value.map((attachment) => attachment.id))
}

function clearVisibleReportDocuments(): void {
  selectedReportDocumentIds.value = removeIds(selectedReportDocumentIds.value, filteredReportDocuments.value.map((attachment) => attachment.id))
}

function downloadAttachment(row: Record<string, unknown>): void {
  const attachment = row.__attachment as EntityReportAttachment | undefined
  if (!attachment?.dataUrl) return
  const link = document.createElement('a')
  link.href = attachment.dataUrl
  link.download = attachment.name
  document.body.append(link)
  link.click()
  link.remove()
}

async function deleteAttachment(row: Record<string, unknown>): Promise<void> {
  const attachment = row.__attachment as { id: string; name: string } | undefined
  if (!attachment) return
  const confirmed = window.confirm(`Удалить файл «${attachment.name}»?`)
  if (!confirmed) return
  await platform.deleteAttachment(attachment.id)
  toast.add({ severity: 'success', summary: 'Файл удалён', detail: attachment.name, life: 2200 })
}

function toReportAttachments(attachments: Attachment[]): EntityReportAttachment[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    date: attachment.date,
    author: platform.userById(attachment.authorId)?.lastName ?? 'Система',
    size: attachment.size,
    mimeType: attachment.mimeType,
    dataUrl: attachment.dataUrl,
  }))
}

function toZipArchiveFiles(attachments: Array<Attachment & { dataUrl: string }>): ZipArchiveFile[] {
  return attachments.map((attachment) => ({
    name: attachment.name,
    dataUrl: attachment.dataUrl,
    date: attachment.date,
  }))
}

function isAllowedAttachmentFile(file: File): boolean {
  return acceptedAttachmentTypes.includes(file.type) || acceptedAttachmentExtensions.includes(fileExtension(file.name))
}

function isPhotoAttachment(attachment: { type: string; mimeType?: string }): boolean {
  return attachment.mimeType?.startsWith('image/') || ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF'].includes(attachment.type.toUpperCase())
}

function isDocumentAttachment(attachment: { type: string; mimeType?: string }): boolean {
  return ['PDF', 'DOC', 'DOCX'].includes(attachment.type.toUpperCase())
}

function hasAttachmentData(attachment: Attachment): attachment is Attachment & { dataUrl: string } {
  return Boolean(attachment.dataUrl)
}

function filterReportAttachments(attachments: Attachment[], search: string): Attachment[] {
  const query = search.trim().toLowerCase()
  if (!query) return attachments
  return attachments.filter((attachment) => {
    const author = platform.userById(attachment.authorId)?.lastName ?? 'Система'
    return [
      attachment.name,
      attachment.type,
      attachment.size,
      formatDateTime(attachment.date),
      author,
    ].some((value) => value.toLowerCase().includes(query))
  })
}

function mergeIds(currentIds: string[], idsToAdd: string[]): string[] {
  return Array.from(new Set([...currentIds, ...idsToAdd]))
}

function removeIds(currentIds: string[], idsToRemove: string[]): string[] {
  const removing = new Set(idsToRemove)
  return currentIds.filter((id) => !removing.has(id))
}

function sortAttachmentsByDate<T extends { date: string }>(attachments: T[], order: ReportSortOrder): T[] {
  return [...attachments].sort((a, b) => {
    const difference = Date.parse(b.date) - Date.parse(a.date)
    return order === 'newest' ? difference : -difference
  })
}

function fileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} Б`
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} КБ`
  return `${(sizeBytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`
}

function safeFileName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-zа-яё0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'report'
}

</script>

<template>
  <div class="entity-card" :class="{ 'entity-card--map': currentTab === 'map' }">
    <div class="entity-card__main">
      <div class="entity-card__header">
        <div class="inline-actions">
          <UiButton
            :label="currentTab === 'map' ? 'Редактировать карту' : 'Редактировать'"
            icon="pi pi-pencil"
            severity="secondary"
            variant="outlined"
            @click="emit('edit', currentTab)"
          />
        </div>
      </div>

      <div v-if="hasIncompleteData" class="entity-card__issues">
        <strong>Данные неполные</strong>
        <span>Проверьте подсвеченные поля и геометрию, затем сохраните изменения.</span>
      </div>

      <UiTabs v-model="currentTab" :tabs="tabs" />

      <EntityPropertyList v-if="currentTab === 'main'" :schema="schema" :object="object" />
      <MapCanvas
        v-else-if="currentTab === 'map'"
        :layers="objectLayers"
        :schemas="[schema]"
        :objects="[object]"
        :visible-layer-ids="visibleLayerIds"
        :selected-object-id="object.id"
        :height="mapHeight"
      />
      <div v-else-if="currentTab === 'documents'" class="stack">
        <div class="documents-toolbar">
          <div>
            <strong>Файлы объекта</strong>
            <span>Фото, PDF и документы Word хранятся в карточке объекта.</span>
          </div>
          <div class="inline-actions">
            <UiButton label="Загрузить" icon="pi pi-upload" severity="secondary" variant="outlined" @click="fileInput?.click()" />
            <UiButton label="Сформировать отчёт" icon="pi pi-file-pdf" @click="openReportDialog" />
          </div>
          <input
            ref="fileInput"
            class="documents-file-input"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx"
            @change="uploadAttachments"
          >
        </div>
        <UiTable
          :rows="documentRows"
          :columns="[
            { field: 'name', header: 'Название' },
            { field: 'type', header: 'Тип', width: '110px' },
            { field: 'date', header: 'Дата' },
            { field: 'author', header: 'Автор' },
            { field: 'size', header: 'Размер', width: '110px' },
            { field: 'actions', header: '', sortable: false, width: '150px' },
          ]"
          empty-message="Документов пока нет"
        >
          <template #cell="{ row, column }">
            <div v-if="column.field === 'actions'" class="document-actions" @click.stop>
              <button type="button" :disabled="!row.__attachment?.dataUrl" @click="downloadAttachment(row)">Скачать</button>
              <button type="button" class="danger" @click="deleteAttachment(row)">Удалить</button>
            </div>
            <span v-else>{{ row[column.field] }}</span>
          </template>
        </UiTable>

        <UiDialog v-model:visible="reportDialogVisible" header="Сформировать PDF-отчёт" width="620px">
          <div class="report-settings">
            <label class="report-option report-option--locked">
              <Checkbox :model-value="true" binary disabled />
              <span>
                <strong>Основная информация</strong>
                <small>Всегда включается в отчёт.</small>
              </span>
            </label>

            <label class="report-option">
              <Checkbox :model-value="reportIncludePhotos" binary @update:model-value="setReportPhotosEnabled" />
              <span>
                <strong>Фото</strong>
                <small>{{ selectedReportPhotoIds.length }} из {{ photoAttachments.length }}</small>
              </span>
            </label>
            <div v-if="reportIncludePhotos" class="report-file-group">
              <div class="report-file-toolbar">
                <div class="form-field">
                  <label>Сортировка</label>
                  <UiSelect v-model="reportPhotoSortOrder" :options="sortOptions" />
                </div>
                <div class="form-field">
                  <label>Поиск</label>
                  <input v-model="reportPhotoSearch" class="report-search-input" type="search" placeholder="Название, дата, автор" />
                </div>
              </div>
              <div class="report-selection-bar" aria-live="polite">
                <span>{{ selectedReportPhotoIds.length }} выбрано · {{ filteredReportPhotos.length }} показано</span>
                <div>
                  <button type="button" @click="selectVisibleReportPhotos">Выбрать найденные</button>
                  <button type="button" @click="clearVisibleReportPhotos">Снять выбор</button>
                </div>
              </div>
              <div class="report-file-list">
	                <label v-for="photo in filteredReportPhotos" :key="photo.id" class="report-file-option">
	                  <Checkbox v-model="selectedReportPhotoIds" :value="photo.id" />
	                  <span>
	                    <strong class="report-file-name" :title="photo.name">{{ photo.name }}</strong>
	                    <small>{{ formatDateTime(photo.date) }} · {{ photo.size }}</small>
	                  </span>
	                </label>
                <p v-if="filteredReportPhotos.length === 0" class="report-file-empty">Ничего не найдено.</p>
              </div>
            </div>

            <label class="report-option">
              <Checkbox :model-value="reportIncludeDocuments" binary @update:model-value="setReportDocumentsEnabled" />
              <span>
                <strong>Документы в ZIP-архив</strong>
                <small>{{ selectedReportDocumentIds.length }} из {{ fileDocumentAttachments.length }}</small>
              </span>
            </label>
            <div v-if="reportIncludeDocuments" class="report-file-group">
              <div class="report-file-toolbar">
                <div class="form-field">
                  <label>Сортировка</label>
                  <UiSelect v-model="reportDocumentSortOrder" :options="sortOptions" />
                </div>
                <div class="form-field">
                  <label>Поиск</label>
                  <input v-model="reportDocumentSearch" class="report-search-input" type="search" placeholder="Название, дата" />
                </div>
              </div>
              <div class="report-selection-bar" aria-live="polite">
                <span>{{ selectedReportDocumentIds.length }} выбрано · {{ filteredReportDocuments.length }} показано</span>
                <div>
                  <button type="button" @click="selectVisibleReportDocuments">Выбрать найденные</button>
                  <button type="button" @click="clearVisibleReportDocuments">Снять выбор</button>
                </div>
              </div>
              <div class="report-file-list">
	                <label v-for="documentItem in filteredReportDocuments" :key="documentItem.id" class="report-file-option">
	                  <Checkbox v-model="selectedReportDocumentIds" :value="documentItem.id" />
	                  <span>
	                    <strong class="report-file-name" :title="documentItem.name">{{ documentItem.name }}</strong>
	                    <small>{{ formatDateTime(documentItem.date) }} · {{ documentItem.type }} · {{ documentItem.size }}</small>
	                  </span>
	                </label>
                <p v-if="filteredReportDocuments.length === 0" class="report-file-empty">Ничего не найдено.</p>
              </div>
            </div>
          </div>
          <template #footer>
            <UiButton label="Отмена" severity="secondary" variant="outlined" @click="reportDialogVisible = false" />
            <UiButton label="Скачать отчёт" icon="pi pi-download" :loading="reportGenerating" @click="generateReport" />
          </template>
        </UiDialog>
      </div>
      <AuditTimeline v-else :events="auditEvents" />
    </div>
  </div>
</template>

<style scoped>
.entity-card {
  display: grid;
  gap: 18px;
}

.entity-card__main {
  display: grid;
  gap: 16px;
  align-content: start;
}

.entity-card__main {
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.entity-card--map .entity-card__main {
  min-height: calc(100vh - 150px);
}

.entity-card__header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
}

.entity-card__issues {
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid #f59e0b;
  border-radius: var(--radius-md);
  background: #fffbeb;
  color: #92400e;
}

.entity-card__issues strong {
  color: #78350f;
}

.entity-card__issues span {
  font-size: 13px;
}

.documents-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.documents-toolbar > div:first-child {
  display: grid;
  gap: 3px;
}

.documents-toolbar span {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.documents-file-input {
  display: none;
}

.document-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.document-actions button {
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.document-actions button:hover,
.document-actions button:focus-visible {
  border-color: #bfdbfe;
  background: var(--color-accent-soft);
  outline: none;
}

.document-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.document-actions button.danger {
  color: #dc2626;
}

.report-settings {
  display: grid;
  gap: 12px;
}

.report-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.report-option--locked {
  background: var(--color-surface-muted);
}

.report-option span {
  display: grid;
  gap: 3px;
}

.report-option small {
  color: var(--color-text-secondary);
}

.report-file-group {
  display: grid;
  gap: 8px;
  padding: 0 0 4px 36px;
}

.report-file-toolbar {
  display: grid;
  grid-template-columns: minmax(160px, 0.8fr) minmax(220px, 1.2fr);
  gap: 10px;
}

.report-search-input {
  width: 100%;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.report-search-input:focus {
  border-color: #93c5fd;
  outline: 3px solid rgba(59, 130, 246, 0.14);
}

.report-selection-bar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(248, 250, 252, 0.96);
  color: var(--color-text-secondary);
  font-size: 13px;
  backdrop-filter: blur(10px);
}

.report-selection-bar div {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.report-selection-bar button {
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.report-selection-bar button:hover,
.report-selection-bar button:focus-visible {
  border-color: #bfdbfe;
  background: var(--color-accent-soft);
  outline: none;
}

.report-file-list {
  position: relative;
  display: grid;
  gap: 5px;
  max-height: 178px;
  overflow: auto;
  padding-right: 5px;
  scrollbar-gutter: stable;
}

.report-file-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  min-height: 54px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.report-file-option span {
  display: grid;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
}

.report-file-name {
  display: block;
  font-size: 13px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-file-option small {
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-file-empty {
  margin: 0;
  padding: 14px 10px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 13px;
  text-align: center;
}

@media (max-width: 760px) {
  .documents-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .report-file-group {
    padding-left: 0;
  }

  .report-file-toolbar {
    grid-template-columns: 1fr;
  }

  .report-selection-bar {
    align-items: stretch;
    flex-direction: column;
  }
}

</style>
