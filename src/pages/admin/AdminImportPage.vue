<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTabs from '../../shared/ui/UiTabs.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { geocodeAddress, type DadataAddressSuggestion } from '../../shared/api/dadata'
import { findBuildingGeometryByCoordinates } from '../../shared/api/nominatim'
import { readSpreadsheetTableFile, type ImportedSpreadsheetTable } from '../../shared/lib/dictionaryImport'
import {
  OBJECT_STATUS_DRAFT,
  OBJECT_STATUS_PUBLISHED,
  objectDataStatusFromIssues,
  validateAddressCompleteness,
  validateEntityObjectData,
  type ObjectDataStatus,
} from '../../shared/lib/entityObjectValidation'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import type { Coordinates, DomainGeometry, EntityField, EntityObjectValues, EntitySchema, FieldType, ObjectValue } from '../../shared/types/domain'

type ImportStep = 'entity' | 'upload' | 'mapping' | 'validation'
type SelectValue = string | number | boolean | null

interface MappingRow {
  fieldId: string
  fieldName: string
  fieldType: string
  required: string
  columnIndex: SelectValue
}

interface ValidationRow {
  rowNumber: number
  status: ObjectDataStatus
  preview: string
  geometryStatus: string
  errors: string[]
  values: EntityObjectValues
  geometry?: DomainGeometry
}

interface ResolvedImportGeometry {
  status: string
  geometry?: DomainGeometry
}

interface BuildingLookupResult {
  geometry?: DomainGeometry
  name?: string
  error?: string
}

const platform = usePlatformStore()
const auth = useAuthStore()
const toast = useToast()

const step = ref<ImportStep>('entity')
const entityId = ref<SelectValue>(platform.activeSchemas[0]?.id ?? null)
const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const importTable = ref<ImportedSpreadsheetTable | null>(null)
const mappings = ref<Record<string, SelectValue>>({})
const validationRows = ref<ValidationRow[]>([])
const importedCount = ref(0)
const importing = ref(false)
const validating = ref(false)
const geocodeCache = new Map<string, DadataAddressSuggestion | null>()
const buildingGeometryCache = new Map<string, BuildingLookupResult>()

const tabs = [
  { label: '1 Сущность', value: 'entity' },
  { label: '2 Загрузка', value: 'upload' },
  { label: '3 Сопоставление', value: 'mapping' },
  { label: '4 Проверка', value: 'validation' },
]
const selectedSchema = computed(() => platform.schemaById(String(entityId.value)))
const entityOptions = computed(() => platform.activeSchemas.map((schema) => ({ label: schema.name, value: schema.id })))
const columnOptions = computed(() => [
  { label: 'Не импортировать', value: '' },
  ...(importTable.value?.columns.map((column) => ({
    label: `${column.label} · ${column.values.length} значений`,
    value: String(column.index),
  })) ?? []),
])
const mappingRows = computed<MappingRow[]>(() =>
  importableFields(selectedSchema.value).map((field) => ({
    fieldId: field.id,
    fieldName: field.name,
    fieldType: fieldTypeLabel(field.type),
    required: field.required ? 'Да' : 'Нет',
    columnIndex: mappings.value[field.id] ?? '',
  })),
)
const requiredFieldsMapped = computed(() =>
  importableFields(selectedSchema.value).every((field) => !field.required || hasMapping(mappings.value[field.id])),
)
const hasMappedFields = computed(() =>
  importableFields(selectedSchema.value).some((field) => hasMapping(mappings.value[field.id])),
)
const publishedRows = computed(() => validationRows.value.filter((row) => row.status === OBJECT_STATUS_PUBLISHED))
const draftRows = computed(() => validationRows.value.filter((row) => row.status === OBJECT_STATUS_DRAFT))
const hasImported = computed(() => importedCount.value > 0)
const canGoNext = computed(() => {
  if (step.value === 'entity') return Boolean(selectedSchema.value)
  if (step.value === 'upload') return Boolean(importTable.value && importTable.value.rows.length > 0)
  if (step.value === 'mapping') return requiredFieldsMapped.value && hasMappedFields.value
  if (step.value === 'validation') return validationRows.value.length > 0 && !hasImported.value
  return false
})
const nextButtonLabel = computed(() => {
  if (step.value === 'mapping') return 'Проверить и определить координаты'
  if (step.value === 'validation') return hasImported.value ? 'Импортировано' : `Импортировать ${validationRows.value.length} строк`
  return 'Далее'
})

watch(selectedSchema, (schema) => {
  resetImportState(false)
  initializeMappings(schema)
})

function importableFields(schema?: EntitySchema): EntityField[] {
  return schema?.fields.filter((field) => field.type !== 'file' && field.type !== 'reference').sort((a, b) => a.order - b.order) ?? []
}

function initializeMappings(schema?: EntitySchema): void {
  const nextMappings: Record<string, SelectValue> = {}
  importableFields(schema).forEach((field) => {
    nextMappings[field.id] = suggestColumn(field)
  })
  mappings.value = nextMappings
}

function suggestColumn(field: EntityField): SelectValue {
  const columns = importTable.value?.columns ?? []
  const normalizedField = normalizeText(field.name)
  const normalizedCode = normalizeText(field.code)
  const match = columns.find((column) => {
    const label = normalizeText(column.label)
    return label.includes(normalizedField) || label.includes(normalizedCode)
  })
  return match ? String(match.index) : ''
}

async function uploadFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const table = await readSpreadsheetTableFile(file)
    if (table.rows.length === 0 || table.columns.length === 0) {
      toast.add({ severity: 'warn', summary: 'В файле нет строк для импорта', life: 2600 })
      return
    }
    fileName.value = file.name
    importTable.value = table
    initializeMappings(selectedSchema.value)
    validationRows.value = []
    step.value = 'mapping'
  } catch (cause) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось прочитать файл',
      detail: cause instanceof Error ? cause.message : 'Проверьте формат файла',
      life: 3600,
    })
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

function updateMapping(fieldId: string, value: SelectValue): void {
  mappings.value = { ...mappings.value, [fieldId]: value }
  validationRows.value = []
}

async function validateImport(): Promise<void> {
  const schema = selectedSchema.value
  const table = importTable.value
  if (!schema || !table) return
  validating.value = true
  try {
    const rows: ValidationRow[] = []
    for (const row of table.rows) {
      rows.push(await validateRow(schema, row.rowNumber, row.values))
    }
    validationRows.value = rows
    importedCount.value = 0
    step.value = 'validation'
  } finally {
    validating.value = false
  }
}

async function validateRow(schema: EntitySchema, rowNumber: number, rowValues: string[]): Promise<ValidationRow> {
  const errors: string[] = []
  const values: EntityObjectValues = {}
  importableFields(schema).forEach((field) => {
    const columnIndex = mappings.value[field.id]
    const rawValue = hasMapping(columnIndex) ? rowValues[Number(columnIndex)] ?? '' : ''
    const converted = convertValue(rawValue, field, errors)
    if (field.required && isEmptyValue(converted)) errors.push(`Поле «${field.name}» обязательно`)
    if (!isEmptyValue(converted)) values[field.code] = converted
  })
  const resolvedGeometry = await resolveAddressGeometry(schema, values, errors)
  const validationIssues = validateEntityObjectData({
    schema,
    dictionaries: platform.dictionaries.filter((dictionary) => dictionary.entityId === schema.id),
    values,
    geometry: resolvedGeometry.geometry,
  })
  validationIssues.forEach((issue) => addUniqueError(errors, issue.message))
  return {
    rowNumber,
    status: objectDataStatusFromIssues(validationIssues.length > 0 || errors.length > 0 ? [{ message: 'Данные неполные' }] : []),
    preview: rowValues.filter(Boolean).slice(0, 4).join(' · ') || 'Пустая строка',
    geometryStatus: resolvedGeometry.status,
    errors,
    values,
    geometry: resolvedGeometry.geometry,
  }
}

async function resolveAddressGeometry(
  schema: EntitySchema,
  values: EntityObjectValues,
  errors: string[],
): Promise<ResolvedImportGeometry> {
  const address = addressValue(schema, values)
  if (!address) return { status: 'Адрес не указан' }
  const addressCheck = validateAddressCompleteness(address)
  if (!addressCheck.ok) {
    addUniqueError(errors, `Адрес заполнен не полностью: ${addressCheck.missing.join(', ')}`)
    return { status: 'Адрес неполный, геометрия не искалась' }
  }
  const suggestion = await geocodeCached(address)
  const geoLon = suggestion?.geoLon
  const geoLat = suggestion?.geoLat
  if (!Number.isFinite(geoLon) || !Number.isFinite(geoLat)) {
    errors.push(`Для адреса «${address}» не удалось определить координаты через DaData`)
    return { status: 'Координаты не найдены' }
  }

  const addressField = schema.fields.find((field) => field.type === 'address' && values[field.code] === address)
  if (addressField && suggestion?.value) values[addressField.code] = suggestion.value

  const coordinates: Coordinates = [geoLon!, geoLat!]
  const building = await buildingGeometryCached(coordinates)
  if (building.geometry) {
    return {
      geometry: building.geometry,
      status: building.name ? `Контур здания найден: ${building.name}` : 'Контур здания найден',
    }
  }
  if (building.error) {
    return {
      geometry: { type: 'Point', coordinates },
      status: 'Nominatim недоступен, сохранена точка адреса',
    }
  }

  return {
    geometry: { type: 'Point', coordinates },
    status: 'Здание не найдено, сохранена точка адреса',
  }
}

async function geocodeCached(address: string): Promise<DadataAddressSuggestion | null> {
  const key = normalizeText(address)
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null
  const suggestion = await geocodeAddress(address)
  geocodeCache.set(key, suggestion)
  return suggestion
}

async function buildingGeometryCached(coordinates: Coordinates): Promise<BuildingLookupResult> {
  const key = coordinates.map((value) => value.toFixed(6)).join(',')
  if (buildingGeometryCache.has(key)) return buildingGeometryCache.get(key)!
  try {
    const building = await findBuildingGeometryByCoordinates(coordinates)
    const result = building ? { geometry: building.geometry, name: building.name } : {}
    buildingGeometryCache.set(key, result)
    return result
  } catch (cause) {
    const result = {
      error: cause instanceof Error ? cause.message : 'Не удалось получить геометрию здания',
    }
    buildingGeometryCache.set(key, result)
    return result
  }
}

function addressValue(schema: EntitySchema, values: EntityObjectValues): string {
  const addressField = schema.fields.find((field) => (
    field.type === 'address'
    && typeof values[field.code] === 'string'
    && String(values[field.code]).trim()
  ))
  return addressField ? String(values[addressField.code]).trim() : ''
}

function convertValue(rawValue: string, field: EntityField, errors: string[]): ObjectValue {
  const value = rawValue.trim()
  if (!value) return null
  if (field.type === 'integer') {
    const number = Number(value.replace(',', '.'))
    if (!Number.isInteger(number)) {
      errors.push(`Поле «${field.name}» должно быть целым числом`)
      return null
    }
    return number
  }
  if (field.type === 'decimal') {
    const number = Number(value.replace(',', '.'))
    if (!Number.isFinite(number)) {
      errors.push(`Поле «${field.name}» должно быть числом`)
      return null
    }
    return number
  }
  if (field.type === 'boolean') return parseBoolean(value, field, errors)
  if (field.type === 'date' || field.type === 'datetime') return parseDateValue(value, field, errors)
  if (field.type === 'enum') return parseEnumValue(value, field, errors)
  return value
}

function parseBoolean(value: string, field: EntityField, errors: string[]): boolean | null {
  const normalized = normalizeText(value)
  if (['да', 'true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['нет', 'false', '0', 'no', 'n'].includes(normalized)) return false
  errors.push(`Поле «${field.name}» должно быть значением «Да» или «Нет»`)
  return null
}

function parseDateValue(value: string, field: EntityField, errors: string[]): string | null {
  const normalized = value.trim()
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return field.type === 'datetime' ? normalized : normalized.slice(0, 10)
  const ruMatch = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (ruMatch) {
    const [, day, month, year] = ruMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  const timestamp = Date.parse(normalized)
  if (!Number.isNaN(timestamp)) return new Date(timestamp).toISOString().slice(0, field.type === 'datetime' ? 16 : 10)
  errors.push(`Поле «${field.name}» должно быть датой`)
  return null
}

function parseEnumValue(value: string, field: EntityField, errors: string[]): string | null {
  const dictionary = platform.dictionaryById(field.enumId)
  if (!dictionary) {
    errors.push(`Для поля «${field.name}» не выбран справочник`)
    return null
  }
  const normalized = normalizeText(value)
  const item = dictionary.items.find((candidate) =>
    candidate.active && (normalizeText(candidate.name) === normalized || normalizeText(candidate.code) === normalized),
  )
  if (item) return item.code
  const looseItem = dictionary.items.find((candidate) => {
    if (!candidate.active) return false
    const name = normalizeText(candidate.name)
    const code = normalizeText(candidate.code)
    return name.includes(normalized) || normalized.includes(name) || code.includes(normalized) || normalized.includes(code)
  })
  if (looseItem) return looseItem.code
  errors.push(`Значение «${value}» не найдено в справочнике поля «${field.name}»`)
  return null
}

async function importRows(): Promise<void> {
  if (!selectedSchema.value || !auth.currentUser || validationRows.value.length === 0 || hasImported.value) return
  importing.value = true
  try {
    await platform.importObjects(validationRows.value.map((row) => ({
      entityId: selectedSchema.value!.id,
      values: row.values,
      geometry: row.geometry,
      status: row.status,
      actorId: auth.currentUser!.id,
    })))
    importedCount.value = validationRows.value.length
    toast.add({
      severity: 'success',
      summary: 'Импорт завершён',
      detail: `${publishedRows.value.length} опубликовано, ${draftRows.value.length} черновиков с неполными данными`,
      life: 3200,
    })
  } finally {
    importing.value = false
  }
}

async function goNext(): Promise<void> {
  if (step.value === 'entity') {
    step.value = 'upload'
    return
  }
  if (step.value === 'upload') {
    step.value = 'mapping'
    return
  }
  if (step.value === 'mapping') {
    await validateImport()
    return
  }
  if (step.value === 'validation') {
    void importRows()
  }
}

function goBack(): void {
  if (step.value === 'upload') step.value = 'entity'
  else if (step.value === 'mapping') step.value = 'upload'
  else if (step.value === 'validation') step.value = 'mapping'
}

function resetImportState(clearFile = true): void {
  if (clearFile) {
    fileName.value = ''
    importTable.value = null
  }
  validationRows.value = []
  importedCount.value = 0
  geocodeCache.clear()
  buildingGeometryCache.clear()
}

function fieldTypeLabel(type: FieldType): string {
  const labels: Record<FieldType, string> = {
    string: 'Строка',
    text: 'Текст',
    integer: 'Целое число',
    decimal: 'Дробное число',
    boolean: 'Да/нет',
    date: 'Дата',
    datetime: 'Дата и время',
    address: 'Адрес',
    enum: 'Справочник',
    reference: 'Ссылка на сущность',
    file: 'Файл',
  }
  return labels[type]
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replaceAll('ё', 'е')
}

function isEmptyValue(value: ObjectValue): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

function hasMapping(value: SelectValue): boolean {
  return value !== '' && value !== null
}

function addUniqueError(errors: string[], message: string): void {
  if (!errors.includes(message)) errors.push(message)
}
</script>

<template>
  <div>
    <UiPageHeader title="Импорт" description="Загрузите табличный файл, сопоставьте колонки и добавьте все строки в выбранную сущность." />
    <div class="panel stack">
      <UiTabs v-model="step" :tabs="tabs" />

      <section v-if="step === 'entity'" class="import-section">
        <div class="form-field">
          <label>Сущность</label>
          <UiSelect v-model="entityId" :options="entityOptions" />
        </div>
        <UiEmptyState
          v-if="entityOptions.length === 0"
          title="Нет опубликованных сущностей"
          description="Сначала опубликуйте сущность в настройках системы."
        />
      </section>

      <section v-else-if="step === 'upload'" class="import-section">
        <button type="button" class="upload-zone" @click="fileInput?.click()">
          <strong>{{ fileName || 'Выберите табличный файл' }}</strong>
          <span>{{ importTable ? `${importTable.rows.length} строк · ${importTable.columns.length} колонок` : 'Поддерживаются .xlsx, .csv и .tsv' }}</span>
        </button>
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept=".xlsx,.csv,.tsv,.txt"
          @change="uploadFile"
        />
      </section>

      <section v-else-if="step === 'mapping'" class="import-section">
        <div class="inline-actions" style="justify-content: space-between">
          <h3 class="surface-title">Сопоставление полей</h3>
          <span class="muted">{{ fileName }}</span>
        </div>
        <UiTable
          :rows="mappingRows as unknown as Record<string, unknown>[]"
          :columns="[
            { field: 'fieldName', header: 'Поле сущности' },
            { field: 'fieldType', header: 'Тип' },
            { field: 'required', header: 'Обязательное', width: '140px' },
            { field: 'columnIndex', header: 'Колонка файла' },
          ]"
          empty-message="У сущности нет полей для импорта"
        >
          <template #cell="{ row, column }">
            <UiSelect
              v-if="column.field === 'columnIndex'"
              :model-value="row.columnIndex as SelectValue"
              :options="columnOptions"
              @update:model-value="updateMapping(String(row.fieldId), $event)"
            />
            <span v-else>{{ row[column.field] }}</span>
          </template>
        </UiTable>
        <p v-if="!hasMappedFields" class="import-warning">Выберите хотя бы одну колонку файла.</p>
        <p v-if="!requiredFieldsMapped" class="import-warning">Для обязательных полей нужно выбрать колонку файла.</p>
      </section>

      <section v-else-if="step === 'validation'" class="import-section">
        <section class="metric-grid">
          <article class="metric-card"><span>Будет опубликовано</span><strong>{{ publishedRows.length }}</strong></article>
          <article class="metric-card"><span>Черновики</span><strong>{{ draftRows.length }}</strong></article>
          <article v-if="hasImported" class="metric-card"><span>Импортировано</span><strong>{{ importedCount }}</strong></article>
        </section>
        <UiTable
          :rows="validationRows as unknown as Record<string, unknown>[]"
          :columns="[
            { field: 'rowNumber', header: 'Строка', width: '100px' },
            { field: 'preview', header: 'Данные' },
            { field: 'geometryStatus', header: 'Координаты' },
            { field: 'status', header: 'Статус', width: '150px' },
            { field: 'errors', header: 'Причина' },
          ]"
          empty-message="Нет строк для проверки"
        >
          <template #cell="{ row, column }">
            <span v-if="column.field === 'status'" :class="row.status === OBJECT_STATUS_PUBLISHED ? 'status-ok' : 'status-warning'">
              {{ row.status === OBJECT_STATUS_PUBLISHED ? 'Будет опубликовано' : 'Черновик' }}
            </span>
            <span v-else-if="column.field === 'errors'">{{ (row.errors as string[]).join('; ') || 'Ошибок нет' }}</span>
            <span v-else>{{ row[column.field] }}</span>
          </template>
        </UiTable>
      </section>

      <div class="inline-actions">
        <UiButton label="Назад" severity="secondary" variant="outlined" :disabled="step === 'entity' || importing || validating" @click="goBack" />
        <UiButton
          :label="nextButtonLabel"
          :disabled="!canGoNext || importing || validating"
          :loading="importing || validating"
          @click="goNext"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.import-section {
  display: grid;
  gap: 14px;
}

.upload-zone {
  display: grid;
  gap: 8px;
  justify-items: center;
  min-height: 180px;
  padding: 48px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-surface-muted);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

.upload-zone:hover,
.upload-zone:focus-visible {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  outline: none;
}

.file-input {
  display: none;
}

.import-warning,
.status-error {
  color: var(--color-danger);
}

.status-warning {
  color: var(--color-warning);
  font-weight: 650;
}

.status-ok {
  color: var(--color-success);
  font-weight: 650;
}
</style>
