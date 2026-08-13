<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Info } from '@lucide/vue'
import { useToast } from 'primevue/usetoast'
import { useRouter } from 'vue-router'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTextarea from '../../shared/ui/UiTextarea.vue'
import { createId } from '../../shared/lib/id'
import { usePermissions } from '../../shared/lib/usePermissions'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import type {
  DashboardFilter,
  DashboardFilterOperator,
  DashboardSummaryBlock,
  EntityField,
  EntityObject,
  EntitySchema,
  ObjectValue,
  SummaryMetric,
  UserSettings,
} from '../../shared/types/domain'

type SelectValue = string | number | boolean | null
type FilterFieldKind = 'date' | 'status' | 'enum' | 'boolean' | 'number' | 'text'

interface SummaryPreview {
  block: DashboardSummaryBlock
  schema: EntitySchema
  title: string
  value: string
}

interface SummaryPreviewGroup {
  schema: EntitySchema
  objectCount: number
  blocks: SummaryPreview[]
}

const SYSTEM_FILTER_FIELDS = [
  { label: 'Статус', value: '__status' },
  { label: 'Дата создания', value: '__createdAt' },
  { label: 'Дата изменения', value: '__updatedAt' },
]

const toast = useToast()
const router = useRouter()
const auth = useAuthStore()
const platform = usePlatformStore()
const permissions = usePermissions()
const summaryWidthStepPx = 10
const defaultSummaryWidthPx = 220
const maxSummaryWidthPx = 960
const editable = ref<UserSettings | null>(null)
const saving = ref(false)
const selectedBlockId = ref('')
const draggedBlockId = ref('')
const resizingBlockId = ref('')
const resizeStartX = ref(0)
const resizeStartWidthPx = ref(defaultSummaryWidthPx)

const metricOptions: Array<{ label: string; value: SummaryMetric }> = [
  { label: 'Количество объектов', value: 'count' },
  { label: 'Заполнено', value: 'filled' },
  { label: 'Пусто', value: 'empty' },
  { label: 'Уникальные значения', value: 'unique' },
  { label: 'Сумма', value: 'sum' },
  { label: 'Среднее', value: 'average' },
]

const availableSchemas = computed(() =>
  platform.runtimeSchemas.filter((schema) => permissions.can('view', schema.id)),
)

const entityOptions = computed(() =>
  availableSchemas.value.map((schema) => ({
    label: schema.name,
    value: schema.id,
  })),
)

const orderedBlocks = computed(() =>
  [...(editable.value?.home.summaryBlocks ?? [])].sort((first, second) => first.order - second.order),
)

const selectedBlock = computed(() =>
  orderedBlocks.value.find((block) => block.id === selectedBlockId.value) ?? orderedBlocks.value[0],
)

const previewGroups = computed<SummaryPreviewGroup[]>(() => {
  const groups = new Map<string, SummaryPreviewGroup>()

  orderedBlocks.value.forEach((block) => {
    const schema = schemaById(block.entityId)
    if (!schema) return

    if (!groups.has(schema.id)) {
      groups.set(schema.id, {
        schema,
        objectCount: platform.objectsByEntity(schema.id).length,
        blocks: [],
      })
    }

    groups.get(schema.id)?.blocks.push({
      block,
      schema,
      title: block.title || defaultTitle(block),
      value: calculateSummaryValue(block),
    })
  })

  return Array.from(groups.values())
})

watch(
  () => [auth.currentUser?.id, platform.userSettings],
  () => {
    const userId = auth.currentUser?.id
    if (!userId) {
      editable.value = null
      selectedBlockId.value = ''
      return
    }

    const source = platform.userSettingsByUser(userId) ?? { userId, home: { summaryBlocks: [] } }
    editable.value = JSON.parse(JSON.stringify(source)) as UserSettings
    normalizeOrder()
    selectedBlockId.value = editable.value.home.summaryBlocks[0]?.id ?? ''
  },
  { immediate: true, deep: true },
)

function metricFieldOptions(entityId: string): Array<{ label: string; value: string }> {
  const schema = schemaById(entityId)
  return [
    { label: 'Вся сущность', value: '' },
    ...(schema?.fields.map((field) => ({ label: field.name, value: field.code })) ?? []),
  ]
}

function filterFieldOptions(entityId: string): Array<{ label: string; value: string }> {
  const schema = schemaById(entityId)
  return [
    ...SYSTEM_FILTER_FIELDS,
    ...(schema?.fields.map((field) => ({ label: field.name, value: field.code })) ?? []),
  ]
}

function filterOperatorOptions(block: DashboardSummaryBlock, filter: DashboardFilter): Array<{ label: string; value: DashboardFilterOperator }> {
  const kind = filterFieldKind(block, filter.fieldCode)
  if (kind === 'date') {
    return [
      { label: 'Сегодня', value: 'today' },
      { label: 'Раньше сегодня', value: 'beforeToday' },
      { label: 'Позже сегодня', value: 'afterToday' },
      { label: 'Равно дате', value: 'equals' },
      { label: 'Раньше даты', value: 'before' },
      { label: 'Позже даты', value: 'after' },
      { label: 'Заполнено', value: 'filled' },
      { label: 'Пусто', value: 'empty' },
    ]
  }

  if (kind === 'status' || kind === 'enum' || kind === 'boolean') {
    return [
      { label: 'Равно', value: 'equals' },
      { label: 'Не равно', value: 'notEquals' },
      { label: 'Заполнено', value: 'filled' },
      { label: 'Пусто', value: 'empty' },
    ]
  }

  return [
    { label: 'Содержит', value: 'contains' },
    { label: 'Равно', value: 'equals' },
    { label: 'Не равно', value: 'notEquals' },
    { label: 'Заполнено', value: 'filled' },
    { label: 'Пусто', value: 'empty' },
    ...(kind === 'number'
      ? [
          { label: 'Больше', value: 'after' as DashboardFilterOperator },
          { label: 'Меньше', value: 'before' as DashboardFilterOperator },
        ]
      : []),
  ]
}

function filterValueOptions(block: DashboardSummaryBlock, filter: DashboardFilter): Array<{ label: string; value: string }> {
  const kind = filterFieldKind(block, filter.fieldCode)
  if (kind === 'status') return statusOptions(block.entityId)
  if (kind === 'boolean') return [
    { label: 'Да', value: 'true' },
    { label: 'Нет', value: 'false' },
  ]

  const field = fieldByCode(block.entityId, filter.fieldCode)
  if (kind === 'enum' && field?.enumId) {
    return platform.dictionaryById(field.enumId)?.items
      .filter((item) => item.active)
      .map((item) => ({ label: item.name, value: item.code })) ?? []
  }

  return []
}

function schemaById(entityId: string): EntitySchema | undefined {
  return availableSchemas.value.find((schema) => schema.id === entityId)
}

function fieldByCode(entityId: string, fieldCode: string): EntityField | undefined {
  return schemaById(entityId)?.fields.find((field) => field.code === fieldCode)
}

function filterFieldKind(block: DashboardSummaryBlock, fieldCode: string): FilterFieldKind {
  if (fieldCode === '__createdAt' || fieldCode === '__updatedAt') return 'date'
  if (fieldCode === '__status') return 'status'

  const field = fieldByCode(block.entityId, fieldCode)
  if (field?.type === 'date' || field?.type === 'datetime') return 'date'
  if (field?.type === 'enum' || field?.type === 'reference') return 'enum'
  if (field?.type === 'boolean') return 'boolean'
  if (field?.type === 'integer' || field?.type === 'decimal') return 'number'
  return 'text'
}

function statusOptions(entityId: string): Array<{ label: string; value: string }> {
  const workflowOptions = platform.workflowByEntity(entityId)?.states.map((state) => ({
    label: state.name,
    value: state.code,
  })) ?? []

  const known = new Map(workflowOptions.map((option) => [option.value, option]))
  platform.objectsByEntity(entityId).forEach((object) => {
    if (object.status && !known.has(object.status)) known.set(object.status, { label: object.status, value: object.status })
  })

  return Array.from(known.values())
}

function summaryCardStyle(block: DashboardSummaryBlock): Record<string, string> {
  const widthPx = clampSummaryWidth(block, currentBlockWidthPx(block))
  return {
    '--summary-width': `${widthPx}px`,
    '--summary-min-width': `${blockMinWidthPx(block)}px`,
  }
}

function currentBlockWidthPx(block: DashboardSummaryBlock): number {
  return Number.isFinite(block.widthPx) ? block.widthPx : defaultSummaryWidthPx
}

function blockMinWidthPx(block: DashboardSummaryBlock): number {
  const title = (block.title || defaultTitle(block)).trim() || 'Название блока'
  const textWidth = measureTitleWidth(title)
  const controlWidth = hasSummaryInfo(block) ? 70 : 42
  return snapSummaryWidth(Math.max(160, textWidth + controlWidth))
}

function measureTitleWidth(title: string): number {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context) {
      context.font = '500 12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      return Math.ceil(context.measureText(title).width)
    }
  }

  return Array.from(title).reduce((width, char) => {
    if (char === ' ') return width + 4
    if (/[A-ZА-ЯЁ0-9]/.test(char)) return width + 8
    if (/[а-яё]/.test(char)) return width + 7.5
    return width + 7
  }, 0)
}

function snapSummaryWidth(widthPx: number): number {
  return Math.round(widthPx / summaryWidthStepPx) * summaryWidthStepPx
}

function clampSummaryWidth(block: DashboardSummaryBlock, widthPx: number): number {
  const fallbackWidth = Number.isFinite(widthPx) ? widthPx : defaultSummaryWidthPx
  return Math.min(maxSummaryWidthPx, Math.max(blockMinWidthPx(block), snapSummaryWidth(fallbackWidth)))
}

function hasSummaryInfo(block: DashboardSummaryBlock): boolean {
  return Boolean(block.description?.trim() || block.filters?.length)
}

function summaryInfoText(block: DashboardSummaryBlock): string {
  const parts = [(block.description ?? '').trim()]
  parts.push(summaryFiltersDescription(block))
  return parts.filter(Boolean).join('\n')
}

function summaryFiltersDescription(block: DashboardSummaryBlock): string {
  const filters = (block.filters ?? [])
    .map((filter) => filterDescription(block, filter))
    .filter(Boolean)

  if (filters.length === 0) return ''
  return `В расчёт попадают объекты, у которых ${filters.join(' и ')}.`
}

function filterDescription(block: DashboardSummaryBlock, filter: DashboardFilter): string {
  const fieldName = humanFieldName(block, filter.fieldCode)
  const value = humanFilterValue(block, filter)
  const kind = filterFieldKind(block, filter.fieldCode)

  if (filter.operator === 'today') return `${fieldName} совпадает с текущей датой`
  if (filter.operator === 'beforeToday') return `${fieldName} раньше текущей даты`
  if (filter.operator === 'afterToday') return `${fieldName} позже текущей даты`
  if (filter.operator === 'filled') return `${fieldName} заполнено`
  if (filter.operator === 'empty') return `${fieldName} не заполнено`
  if (filter.operator === 'contains') return value ? `${fieldName} содержит ${quoteValue(value)}` : `${fieldName} содержит заданное значение`
  if (filter.operator === 'notEquals') return value ? `${fieldName} не имеет значение ${quoteValue(value)}` : `${fieldName} не равно заданному значению`

  if (filter.operator === 'before') {
    return value ? `${fieldName} ${kind === 'number' ? 'меньше' : 'раньше'} ${quoteValue(value)}` : `${fieldName} меньше заданного значения`
  }

  if (filter.operator === 'after') {
    return value ? `${fieldName} ${kind === 'number' ? 'больше' : 'позже'} ${quoteValue(value)}` : `${fieldName} больше заданного значения`
  }

  return value ? `${fieldName} имеет значение ${quoteValue(value)}` : `${fieldName} равно заданному значению`
}

function humanFieldName(block: DashboardSummaryBlock, fieldCode: string): string {
  if (fieldCode === '__status') return 'статус'
  if (fieldCode === '__createdAt') return 'дата создания'
  if (fieldCode === '__updatedAt') return 'дата изменения'
  return lowerFirst(fieldByCode(block.entityId, fieldCode)?.name ?? 'поле')
}

function humanFilterValue(block: DashboardSummaryBlock, filter: DashboardFilter): string {
  if (!needsFilterValue(filter.operator)) return ''
  if (filterFieldKind(block, filter.fieldCode) === 'boolean') return filter.value === 'true' ? 'Да' : 'Нет'
  return filterValueOptions(block, filter).find((option) => option.value === filter.value)?.label ?? filter.value.trim()
}

function quoteValue(value: string): string {
  return `«${value}»`
}

function lowerFirst(value: string): string {
  return value ? value[0].toLocaleLowerCase('ru-RU') + value.slice(1) : value
}

function needsFilterValue(operator: DashboardFilterOperator): boolean {
  return !['filled', 'empty', 'today', 'beforeToday', 'afterToday'].includes(operator)
}

function hasSelectValue(block: DashboardSummaryBlock, filter: DashboardFilter): boolean {
  return filterValueOptions(block, filter).length > 0
}

function setBlockEntity(block: DashboardSummaryBlock, value: SelectValue): void {
  block.entityId = String(value ?? '')
  const schema = schemaById(block.entityId)
  block.fieldCode = block.metric === 'count' ? '' : schema?.fields[0]?.code ?? ''
  block.filters = []
  block.title = defaultTitle(block)
}

function setBlockField(block: DashboardSummaryBlock, value: SelectValue): void {
  block.fieldCode = String(value ?? '')
  if (block.fieldCode === '') block.metric = 'count'
  if (!block.title.trim()) block.title = defaultTitle(block)
}

function setBlockMetric(block: DashboardSummaryBlock, value: SelectValue): void {
  block.metric = String(value ?? 'count') as SummaryMetric
  if (block.metric === 'count') block.fieldCode = ''
  if (!block.title.trim()) block.title = defaultTitle(block)
}

function setFilterField(block: DashboardSummaryBlock, filter: DashboardFilter, value: SelectValue): void {
  filter.fieldCode = String(value ?? '__createdAt')
  filter.operator = defaultFilterOperator(block, filter.fieldCode)
  filter.value = defaultFilterValue(block, filter)
}

function setFilterOperator(block: DashboardSummaryBlock, filter: DashboardFilter, value: SelectValue): void {
  filter.operator = String(value ?? 'equals') as DashboardFilterOperator
  if (!needsFilterValue(filter.operator)) filter.value = ''
  if (needsFilterValue(filter.operator) && !filter.value) filter.value = defaultFilterValue(block, filter)
}

function addBlock(): void {
  const schema = availableSchemas.value[0]
  if (!editable.value || !schema) return
  const block: DashboardSummaryBlock = {
    id: createId('sum'),
    entityId: schema.id,
    fieldCode: '',
    metric: 'count',
    title: schema.name,
    showInfo: false,
    description: '',
    widthPx: defaultSummaryWidthPx,
    order: editable.value.home.summaryBlocks.length + 1,
    filters: [],
  }
  block.widthPx = clampSummaryWidth(block, block.widthPx)
  editable.value.home.summaryBlocks.push(block)
  selectedBlockId.value = block.id
}

function addFilter(block: DashboardSummaryBlock): void {
  const filter: DashboardFilter = {
    id: createId('flt'),
    fieldCode: '__createdAt',
    operator: 'today',
    value: '',
  }
  block.filters.push(filter)
}

function deleteFilter(block: DashboardSummaryBlock, filterId: string): void {
  block.filters = block.filters.filter((filter) => filter.id !== filterId)
}

function deleteBlock(blockId: string): void {
  if (!editable.value) return
  editable.value.home.summaryBlocks = editable.value.home.summaryBlocks.filter((block) => block.id !== blockId)
  normalizeOrder()
  selectedBlockId.value = editable.value.home.summaryBlocks[0]?.id ?? ''
}

function dragStart(blockId: string): void {
  if (resizingBlockId.value) return
  draggedBlockId.value = blockId
}

function dragEnd(): void {
  draggedBlockId.value = ''
}

function dropOnBlock(targetBlockId: string): void {
  if (!draggedBlockId.value || draggedBlockId.value === targetBlockId) return
  reorderBlock(draggedBlockId.value, targetBlockId)
  draggedBlockId.value = ''
}

function dropAtEnd(): void {
  if (!draggedBlockId.value || orderedBlocks.value.at(-1)?.id === draggedBlockId.value) return
  const targetId = orderedBlocks.value.at(-1)?.id
  if (targetId) reorderBlock(draggedBlockId.value, targetId, true)
  draggedBlockId.value = ''
}

function reorderBlock(sourceBlockId: string, targetBlockId: string, afterTarget = false): void {
  if (!editable.value) return
  const blocks = orderedBlocks.value
  const sourceIndex = blocks.findIndex((block) => block.id === sourceBlockId)
  const targetIndex = blocks.findIndex((block) => block.id === targetBlockId)
  if (sourceIndex < 0 || targetIndex < 0) return

  const [source] = blocks.splice(sourceIndex, 1)
  const normalizedTargetIndex = blocks.findIndex((block) => block.id === targetBlockId)
  blocks.splice(afterTarget ? normalizedTargetIndex + 1 : normalizedTargetIndex, 0, source)
  blocks.forEach((block, index) => {
    block.order = index + 1
  })
  editable.value.home.summaryBlocks = blocks
}

function normalizeOrder(): void {
  if (!editable.value) return
  editable.value.home.summaryBlocks = [...editable.value.home.summaryBlocks]
    .sort((first, second) => first.order - second.order)
    .map((block, index) => ({
      ...block,
      order: index + 1,
      showInfo: hasSummaryInfo(block),
      description: block.description ?? '',
      widthPx: clampSummaryWidth(block, currentBlockWidthPx(block)),
      filters: block.filters ?? [],
    }))
}

function startResize(block: DashboardSummaryBlock, event: PointerEvent): void {
  event.preventDefault()
  event.stopPropagation()
  selectedBlockId.value = block.id
  resizingBlockId.value = block.id
  resizeStartX.value = event.clientX
  resizeStartWidthPx.value = currentBlockWidthPx(block)
  window.addEventListener('pointermove', resizeBlock)
  window.addEventListener('pointerup', finishResize, { once: true })
}

function resizeBlock(event: PointerEvent): void {
  const block = orderedBlocks.value.find((candidate) => candidate.id === resizingBlockId.value)
  if (!block) return
  const delta = event.clientX - resizeStartX.value
  block.widthPx = clampSummaryWidth(block, resizeStartWidthPx.value + delta)
}

function finishResize(): void {
  window.removeEventListener('pointermove', resizeBlock)
  resizingBlockId.value = ''
}

function defaultFilterOperator(block: DashboardSummaryBlock, fieldCode: string): DashboardFilterOperator {
  const kind = filterFieldKind(block, fieldCode)
  if (kind === 'date') return 'today'
  if (kind === 'text') return 'contains'
  return 'equals'
}

function defaultFilterValue(block: DashboardSummaryBlock, filter: DashboardFilter): string {
  const options = filterValueOptions(block, filter)
  if (options.length > 0) return options[0].value
  const kind = filterFieldKind(block, filter.fieldCode)
  if (kind === 'date' && (filter.operator === 'equals' || filter.operator === 'before' || filter.operator === 'after')) return todayKey()
  if (kind === 'number' && (filter.operator === 'equals' || filter.operator === 'before' || filter.operator === 'after')) return '0'
  return ''
}

function defaultTitle(block: DashboardSummaryBlock): string {
  const schema = schemaById(block.entityId)
  const field = fieldByCode(block.entityId, block.fieldCode)
  if (block.metric === 'count') return schema?.name ?? 'Саммари'
  return field ? `${schema?.name ?? 'Сущность'} · ${field.name}` : schema?.name ?? 'Саммари'
}

function calculateSummaryValue(block: DashboardSummaryBlock): string {
  const objects = filteredObjects(block)
  if (block.metric === 'count') return formatNumber(objects.length)

  const values = objects.map((object) => object.values[block.fieldCode])
  if (block.metric === 'filled') return formatNumber(values.filter(isFilled).length)
  if (block.metric === 'empty') return formatNumber(values.filter((value) => !isFilled(value)).length)
  if (block.metric === 'unique') {
    const uniqueValues = new Set(values.filter(isFilled).map((value) => String(value)))
    return formatNumber(uniqueValues.size)
  }

  const numericValues = values
    .filter(isFilled)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))

  if (numericValues.length === 0) return '—'
  if (block.metric === 'sum') return formatNumber(numericValues.reduce((sum, value) => sum + value, 0))
  return formatNumber(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length)
}

function filteredObjects(block: DashboardSummaryBlock): EntityObject[] {
  return platform.objectsByEntity(block.entityId).filter((object) =>
    (block.filters ?? []).every((filter) => matchesFilter(object, filter)),
  )
}

function matchesFilter(object: EntityObject, filter: DashboardFilter): boolean {
  const value = objectFilterValue(object, filter.fieldCode)
  if (filter.operator === 'filled') return isFilled(value)
  if (filter.operator === 'empty') return !isFilled(value)

  if (filter.operator === 'today') return dateKey(value) === todayKey()
  if (filter.operator === 'beforeToday') return Boolean(dateKey(value)) && dateKey(value) < todayKey()
  if (filter.operator === 'afterToday') return Boolean(dateKey(value)) && dateKey(value) > todayKey()

  if (filter.operator === 'before' || filter.operator === 'after') {
    const currentDate = dateKey(value)
    const targetDate = dateKey(filter.value)
    if (currentDate && targetDate) return filter.operator === 'before' ? currentDate < targetDate : currentDate > targetDate

    const currentNumber = Number(value)
    const targetNumber = Number(filter.value)
    if (Number.isFinite(currentNumber) && Number.isFinite(targetNumber)) {
      return filter.operator === 'before' ? currentNumber < targetNumber : currentNumber > targetNumber
    }
    return false
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

function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
}

function todayKey(): string {
  return localDateKey(new Date())
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

async function save(): Promise<void> {
  if (!editable.value) return
  saving.value = true
  normalizeOrder()
  try {
    await platform.saveUserSettings(editable.value)
    toast.add({ severity: 'success', summary: 'Настройки главного экрана сохранены', life: 2200 })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <UiPageHeader
      eyebrow="Приложение"
      title="Главная"
      :description="platform.settings?.municipalityName ?? 'Нижний Новгород'"
    >
      <template #actions>
        <UiButton
          label="Добавить блок"
          icon="pi pi-plus"
          severity="secondary"
          variant="outlined"
          :disabled="availableSchemas.length === 0"
          @click="addBlock"
        />
        <UiButton label="Сохранить" icon="pi pi-save" :loading="saving" @click="save" />
      </template>
    </UiPageHeader>

    <div class="home-settings-layout">
      <section class="home-preview-surface">
        <UiEmptyState
          v-if="availableSchemas.length === 0"
          title="Нет сущностей для саммари"
          description="Сначала создайте и опубликуйте сущность, затем настройте блоки главного экрана."
        >
          <UiButton label="Создать сущность" icon="pi pi-plus" @click="router.push('/admin/entities/new')" />
        </UiEmptyState>

        <UiEmptyState
          v-else-if="previewGroups.length === 0"
          title="Саммари не настроены"
          description="Создайте первый блок для главного экрана."
        >
          <UiButton label="Добавить блок" icon="pi pi-plus" @click="addBlock" />
        </UiEmptyState>

        <div v-else class="dashboard-summary" @dragover.prevent @drop="dropAtEnd">
          <section v-for="group in previewGroups" :key="group.schema.id" class="summary-entity-section">
            <div class="summary-entity-section__header">
              <h3>{{ group.schema.name }}</h3>
              <span>{{ group.objectCount }} объектов</span>
            </div>

            <div class="summary-grid">
              <article
                v-for="summary in group.blocks"
                :key="summary.block.id"
                class="summary-card summary-card--editor"
                :class="{
                  'summary-card--selected': selectedBlock?.id === summary.block.id,
                  'summary-card--dragging': draggedBlockId === summary.block.id,
                  'summary-card--resizing': resizingBlockId === summary.block.id,
                  'summary-card--has-info': hasSummaryInfo(summary.block),
                }"
                :style="summaryCardStyle(summary.block)"
                draggable="true"
                @click="selectedBlockId = summary.block.id"
                @dragstart="dragStart(summary.block.id)"
                @dragend="dragEnd"
                @dragover.prevent
                @drop.stop="dropOnBlock(summary.block.id)"
              >
                <button
                  v-if="hasSummaryInfo(summary.block)"
                  class="summary-card__info"
                  type="button"
                  aria-label="Описание расчёта"
                  @click.stop
                >
                  <Info :size="14" />
                  <span class="summary-card__tooltip">{{ summaryInfoText(summary.block) }}</span>
                </button>
                <span class="summary-card__title">{{ summary.title }}</span>
                <strong>{{ summary.value }}</strong>
                <span
                  class="summary-card__resize"
                  role="separator"
                  aria-label="Изменить ширину блока"
                  @click.stop
                  @pointerdown.stop.prevent="startResize(summary.block, $event)"
                />
              </article>
            </div>
          </section>
        </div>
      </section>

      <aside class="summary-inspector">
        <UiEmptyState
          v-if="!selectedBlock"
          title="Блок не выбран"
          description="Выберите блок в сетке или создайте новый."
        />

        <template v-else>
          <div class="summary-inspector__header">
            <h3 class="surface-title">Настройка блока</h3>
            <UiButton label="Удалить" severity="danger" variant="outlined" @click="deleteBlock(selectedBlock.id)" />
          </div>

          <div class="summary-inspector__form">
            <div class="form-field full">
              <label>Название</label>
              <UiInput v-model="selectedBlock.title" />
            </div>

            <div class="form-field full">
              <label>Описание и условия расчёта</label>
              <UiTextarea v-model="selectedBlock.description" :rows="3" />
            </div>

            <div class="form-field">
              <label>Сущность</label>
              <UiSelect
                :model-value="selectedBlock.entityId"
                :options="entityOptions"
                @update:model-value="setBlockEntity(selectedBlock, $event)"
              />
            </div>

            <div class="form-field">
              <label>Расчёт</label>
              <UiSelect
                :model-value="selectedBlock.metric"
                :options="metricOptions"
                @update:model-value="setBlockMetric(selectedBlock, $event)"
              />
            </div>

            <div class="form-field">
              <label>Поле расчёта</label>
              <UiSelect
                :model-value="selectedBlock.fieldCode"
                :options="metricFieldOptions(selectedBlock.entityId)"
                :disabled="selectedBlock.metric === 'count'"
                @update:model-value="setBlockField(selectedBlock, $event)"
              />
            </div>

          </div>

          <div class="summary-filter-section">
            <div class="summary-filter-section__header">
              <h3 class="surface-title">Условия</h3>
              <UiButton label="Добавить условие" icon="pi pi-plus" severity="secondary" variant="outlined" @click="addFilter(selectedBlock)" />
            </div>

            <div v-if="selectedBlock.filters.length === 0" class="summary-filter-empty">Блок считает все объекты выбранной сущности.</div>

            <div v-else class="summary-filter-list">
              <article v-for="filter in selectedBlock.filters" :key="filter.id" class="summary-filter-row">
                <div class="form-field">
                  <label>Поле</label>
                  <UiSelect
                    :model-value="filter.fieldCode"
                    :options="filterFieldOptions(selectedBlock.entityId)"
                    @update:model-value="setFilterField(selectedBlock, filter, $event)"
                  />
                </div>

                <div class="form-field">
                  <label>Условие</label>
                  <UiSelect
                    :model-value="filter.operator"
                    :options="filterOperatorOptions(selectedBlock, filter)"
                    @update:model-value="setFilterOperator(selectedBlock, filter, $event)"
                  />
                </div>

                <div v-if="needsFilterValue(filter.operator)" class="form-field">
                  <label>Значение</label>
                  <UiSelect
                    v-if="hasSelectValue(selectedBlock, filter)"
                    v-model="filter.value"
                    :options="filterValueOptions(selectedBlock, filter)"
                  />
                  <UiInput v-else v-model="filter.value" />
                </div>

                <UiButton label="Удалить" severity="danger" variant="outlined" @click="deleteFilter(selectedBlock, filter.id)" />
              </article>
            </div>
          </div>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.home-settings-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: 18px;
  align-items: start;
}

.summary-inspector {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  padding: 16px;
}

.summary-inspector__header,
.summary-filter-section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.summary-inspector {
  position: sticky;
  top: 96px;
}

.home-preview-surface {
  min-width: 0;
}

.dashboard-summary {
  display: grid;
  gap: 22px;
}

.summary-entity-section {
  display: grid;
  gap: 12px;
}

.summary-entity-section__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.summary-entity-section__header h3 {
  margin: 0;
  font-size: 16px;
  letter-spacing: 0;
}

.summary-entity-section__header span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.summary-grid {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 12px;
  overflow-x: auto;
}

.summary-card {
  position: relative;
  flex: 0 0 var(--summary-width);
  width: var(--summary-width);
  max-width: 100%;
  min-width: var(--summary-min-width);
  min-height: 128px;
  display: grid;
  grid-template-rows: auto 1fr;
  align-content: stretch;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-sizing: border-box;
}

.summary-card--editor {
  cursor: grab;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}

.summary-card--editor .summary-card__title {
  padding-right: 16px;
}

.summary-card--has-info .summary-card__title {
  padding-right: 46px;
}

.summary-card--editor:hover,
.summary-card--selected {
  border-color: #93c5fd;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.summary-card--dragging {
  opacity: 0.55;
  transform: scale(0.98);
}

.summary-card--resizing {
  cursor: ew-resize;
  user-select: none;
}

.summary-card__info {
  position: absolute;
  top: 10px;
  right: 14px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: help;
}

.summary-card__tooltip {
  position: absolute;
  top: 30px;
  right: 0;
  z-index: 5;
  width: min(280px, 60vw);
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-text);
  color: #ffffff;
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  white-space: pre-line;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px);
  transition: opacity 140ms ease, transform 140ms ease;
}

.summary-card__info:hover .summary-card__tooltip,
.summary-card__info:focus-visible .summary-card__tooltip {
  opacity: 1;
  transform: translateY(0);
}

.summary-card__title {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.summary-card strong {
  display: block;
  align-self: center;
  justify-self: center;
  text-align: center;
  font-size: 30px;
  line-height: 1;
}

.summary-card__resize {
  position: absolute;
  top: 36px;
  right: -5px;
  bottom: 10px;
  width: 10px;
  border-radius: 999px;
  cursor: ew-resize;
}

.summary-card__resize::after {
  content: '';
  position: absolute;
  top: 28px;
  right: 4px;
  bottom: 28px;
  width: 2px;
  border-radius: 999px;
  background: var(--color-border-strong);
  opacity: 0;
  transition: opacity 140ms ease;
}

.summary-card--editor:hover .summary-card__resize::after,
.summary-card--selected .summary-card__resize::after,
.summary-card--resizing .summary-card__resize::after {
  opacity: 1;
}

.summary-inspector__form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.summary-filter-section {
  display: grid;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

.summary-filter-empty {
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
  font-size: 12px;
}

.summary-filter-list {
  display: grid;
  gap: 10px;
}

.summary-filter-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

@media (max-width: 1280px) {
  .home-settings-layout {
    grid-template-columns: 1fr;
  }

  .summary-inspector {
    position: static;
  }
}

@media (max-width: 1180px) {
  .summary-grid {
    flex-wrap: wrap;
  }
}
</style>
