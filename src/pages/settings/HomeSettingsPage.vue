<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Info } from '@lucide/vue'
import { useToast } from 'primevue/usetoast'
import { useRouter } from 'vue-router'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTextarea from '../../shared/ui/UiTextarea.vue'
import { matchesDashboardFilter, matchesDashboardFilterValue, type DashboardFilterFieldKind } from '../../shared/lib/dashboardFilters'
import { createId } from '../../shared/lib/id'
import { usePermissions } from '../../shared/lib/usePermissions'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import type {
  DashboardFilter,
  DashboardFilterGroup,
  DashboardFilterOperator,
  DashboardBlockKind,
  DashboardSummaryBlock,
  DashboardThenAction,
  EntityField,
  EntityObject,
  EntitySchema,
  ObjectValue,
  SummaryMetric,
  UserSettings,
} from '../../shared/types/domain'

type SelectValue = string | number | boolean | null

interface SummaryPreview {
  block: DashboardSummaryBlock
  schema: EntitySchema
  title: string
  value: string
  thenAction: DashboardThenAction
  bars: SummaryChartBar[]
}

interface SummaryPreviewGroup {
  schema: EntitySchema
  blocks: SummaryPreview[]
}

interface SummaryChartBar {
  label: string
  value: number
  formattedValue: string
  widthPercent: number
}

const SYSTEM_FILTER_FIELDS = [
  { label: 'Статус', value: '__status' },
  { label: 'Дата создания', value: '__createdAt' },
  { label: 'Дата изменения', value: '__updatedAt' },
]
const SUMMARY_VALUE_FIELD_CODE = '__summaryValue'

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
const blockKindOptions: Array<{ label: string; value: DashboardBlockKind }> = [
  { label: 'Показатель', value: 'metric' },
  { label: 'Столбчатый график', value: 'barChart' },
]
const thenActionOptions: Array<{ label: string; value: DashboardThenAction }> = [
  { label: 'Ничего', value: 'none' },
  { label: 'Зелёный', value: 'green' },
  { label: 'Жёлтый', value: 'yellow' },
  { label: 'Красный', value: 'red' },
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
        blocks: [],
      })
    }

    groups.get(schema.id)?.blocks.push({
      block,
      schema,
      title: block.title || defaultTitle(block),
      value: calculateSummaryValue(block),
      thenAction: summaryThenAction(block),
      bars: chartBars(block),
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

function groupFieldOptions(entityId: string): Array<{ label: string; value: string }> {
  const schema = schemaById(entityId)
  return [
    { label: 'Статус', value: '__status' },
    { label: 'Дата создания', value: '__createdAt' },
    { label: 'Дата изменения', value: '__updatedAt' },
    ...(schema?.fields
      .filter((field) => field.type !== 'file')
      .map((field) => ({ label: field.name, value: field.code })) ?? []),
  ]
}

function filterFieldOptions(block: DashboardSummaryBlock): Array<{ label: string; value: string }> {
  const schema = schemaById(block.entityId)
  return [
    { label: 'Расчётное значение', value: SUMMARY_VALUE_FIELD_CODE },
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

  if (kind === 'number') {
    return [
      { label: 'Больше', value: 'after' },
      { label: 'Меньше', value: 'before' },
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

function filterFieldKind(block: DashboardSummaryBlock, fieldCode: string): DashboardFilterFieldKind {
  if (fieldCode === SUMMARY_VALUE_FIELD_CODE) return 'number'
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
  const baseWidth = block.kind === 'barChart' ? 360 : 160
  return snapSummaryWidth(Math.max(baseWidth, textWidth + controlWidth))
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
  return Boolean(block.description?.trim() || block.filters?.length || block.filterGroups?.length)
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
  const groups = (block.filterGroups ?? [])
    .map((group, index) => {
      const description = group.filters.map((filter) => filterDescription(block, filter)).filter(Boolean).join(' и ')
      if (!description) return ''
      const action = group.thenAction !== 'none' ? ` тогда ${thenActionLabel(group.thenAction).toLowerCase()}` : ''
      return `группа ${index + 1}: ${description}${action}`
    })
    .filter(Boolean)

  if (filters.length === 0 && groups.length === 0) return ''
  return `Условия: ${[...filters, ...groups].join('; ')}.`
}

function filterDescription(block: DashboardSummaryBlock, filter: DashboardFilter): string {
  const fieldName = humanFieldName(block, filter.fieldCode)
  const value = humanFilterValue(block, filter)
  const kind = filterFieldKind(block, filter.fieldCode)

  const action = filter.thenAction && filter.thenAction !== 'none'
    ? ` тогда ${thenActionLabel(filter.thenAction).toLowerCase()}`
    : ''

  if (filter.operator === 'today') return `${fieldName} совпадает с текущей датой${action}`
  if (filter.operator === 'beforeToday') return `${fieldName} раньше текущей даты${action}`
  if (filter.operator === 'afterToday') return `${fieldName} позже текущей даты${action}`
  if (filter.operator === 'filled') return `${fieldName} заполнено${action}`
  if (filter.operator === 'empty') return `${fieldName} не заполнено${action}`
  if (filter.operator === 'contains') return value ? `${fieldName} содержит ${quoteValue(value)}${action}` : `${fieldName} содержит заданное значение${action}`
  if (filter.operator === 'notEquals') return value ? `${fieldName} не имеет значение ${quoteValue(value)}${action}` : `${fieldName} не равно заданному значению${action}`

  if (filter.operator === 'before') {
    return value ? `${fieldName} ${kind === 'number' ? 'меньше' : 'раньше'} ${quoteValue(value)}${action}` : `${fieldName} меньше заданного значения${action}`
  }

  if (filter.operator === 'after') {
    return value ? `${fieldName} ${kind === 'number' ? 'больше' : 'позже'} ${quoteValue(value)}${action}` : `${fieldName} больше заданного значения${action}`
  }

  return value ? `${fieldName} имеет значение ${quoteValue(value)}${action}` : `${fieldName} равно заданному значению${action}`
}

function humanFieldName(block: DashboardSummaryBlock, fieldCode: string): string {
  if (fieldCode === SUMMARY_VALUE_FIELD_CODE) return 'расчётное значение'
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

function summaryThenAction(block: DashboardSummaryBlock): DashboardThenAction {
  const actions = [
    ...(block.filters ?? [])
      .filter((filter) => filter.thenAction && filter.thenAction !== 'none' && filterMatchesBlock(block, filter))
      .map((filter) => filter.thenAction ?? 'none'),
    ...(block.filterGroups ?? [])
      .filter((group) => group.thenAction !== 'none' && groupMatchesBlock(block, group))
      .map((group) => group.thenAction),
  ]

  if (actions.includes('red')) return 'red'
  if (actions.includes('yellow')) return 'yellow'
  if (actions.includes('green')) return 'green'
  return 'none'
}

function filterMatchesBlock(block: DashboardSummaryBlock, filter: DashboardFilter): boolean {
  if (filter.fieldCode === SUMMARY_VALUE_FIELD_CODE) {
    return matchesDashboardFilterValue(calculateSummaryRawValue(block) ?? undefined, filter, 'number')
  }
  return filterMatchesAnyObject(block, filter)
}

function filterMatchesAnyObject(block: DashboardSummaryBlock, filter: DashboardFilter): boolean {
  return platform.objectsByEntity(block.entityId).some((object) =>
    matchesDashboardFilter(object, filter, filterFieldKind(block, filter.fieldCode)),
  )
}

function groupMatchesBlock(block: DashboardSummaryBlock, group: DashboardFilterGroup): boolean {
  const summaryFilters = group.filters.filter((filter) => filter.fieldCode === SUMMARY_VALUE_FIELD_CODE)
  const objectFilters = group.filters.filter((filter) => filter.fieldCode !== SUMMARY_VALUE_FIELD_CODE)
  const summaryMatches = summaryFilters.every((filter) =>
    matchesDashboardFilterValue(calculateSummaryRawValue(block) ?? undefined, filter, 'number'),
  )
  const objectsMatch = objectFilters.length === 0 || platform.objectsByEntity(block.entityId).some((object) =>
    objectFilters.every((filter) =>
      matchesDashboardFilter(object, filter, filterFieldKind(block, filter.fieldCode)),
    ),
  )

  return summaryMatches && objectsMatch
}

function thenActionLabel(action: DashboardThenAction): string {
  return thenActionOptions.find((option) => option.value === action)?.label ?? 'Ничего'
}

function setBlockKind(block: DashboardSummaryBlock, value: SelectValue): void {
  block.kind = String(value ?? 'metric') === 'barChart' ? 'barChart' : 'metric'
  if (block.kind === 'barChart') {
    block.chartType = 'bar'
    block.groupByFieldCode = block.groupByFieldCode || defaultGroupFieldCode(block.entityId)
    block.widthPx = clampSummaryWidth(block, Math.max(currentBlockWidthPx(block), 460))
  } else {
    block.chartType = undefined
    block.groupByFieldCode = undefined
    block.widthPx = clampSummaryWidth(block, currentBlockWidthPx(block))
  }
  if (!block.title.trim()) block.title = defaultTitle(block)
}

function setBlockEntity(block: DashboardSummaryBlock, value: SelectValue): void {
  block.entityId = String(value ?? '')
  const schema = schemaById(block.entityId)
  block.fieldCode = block.metric === 'count' ? '' : schema?.fields[0]?.code ?? ''
  if (block.kind === 'barChart') block.groupByFieldCode = defaultGroupFieldCode(block.entityId)
  block.filters = []
  block.filterGroups = []
  block.title = defaultTitle(block)
}

function setBlockGroupField(block: DashboardSummaryBlock, value: SelectValue): void {
  block.groupByFieldCode = String(value ?? defaultGroupFieldCode(block.entityId))
  if (!block.title.trim()) block.title = defaultTitle(block)
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
  addDashboardBlock('metric')
}

function addChartBlock(): void {
  addDashboardBlock('barChart')
}

function addDashboardBlock(kind: DashboardBlockKind): void {
  const schema = availableSchemas.value[0]
  if (!editable.value || !schema) return
  const block: DashboardSummaryBlock = {
    id: createId('sum'),
    kind,
    entityId: schema.id,
    fieldCode: '',
    metric: 'count',
    chartType: kind === 'barChart' ? 'bar' : undefined,
    groupByFieldCode: kind === 'barChart' ? defaultGroupFieldCode(schema.id) : undefined,
    title: '',
    showInfo: false,
    description: '',
    widthPx: kind === 'barChart' ? 460 : defaultSummaryWidthPx,
    order: editable.value.home.summaryBlocks.length + 1,
    filters: [],
    filterGroups: [],
  }
  block.title = defaultTitle(block)
  block.widthPx = clampSummaryWidth(block, block.widthPx)
  editable.value.home.summaryBlocks.push(block)
  selectedBlockId.value = block.id
}

function addFilter(block: DashboardSummaryBlock): void {
  if (block.filters.length >= 1) return
  block.filterGroups = []
  const filter: DashboardFilter = {
    id: createId('flt'),
    fieldCode: '__createdAt',
    operator: 'today',
    value: '',
    thenAction: 'none',
  }
  block.filters.push(filter)
}

function deleteFilter(block: DashboardSummaryBlock, filterId: string): void {
  block.filters = block.filters.filter((filter) => filter.id !== filterId)
}

function addFilterGroup(block: DashboardSummaryBlock): void {
  if ((block.filterGroups ?? []).length >= 1) return
  block.filters = []
  const group: DashboardFilterGroup = {
    id: createId('fg'),
    filters: [],
    thenAction: 'none',
  }
  block.filterGroups = [...(block.filterGroups ?? []), group]
  addGroupFilter(block, group)
}

function deleteFilterGroup(block: DashboardSummaryBlock, groupId: string): void {
  block.filterGroups = (block.filterGroups ?? []).filter((group) => group.id !== groupId)
}

function addGroupFilter(block: DashboardSummaryBlock, group: DashboardFilterGroup): void {
  group.filters.push({
    id: createId('flt'),
    fieldCode: '__createdAt',
    operator: 'today',
    value: '',
    thenAction: 'none',
  })
  block.filterGroups = [...(block.filterGroups ?? [])]
}

function deleteGroupFilter(block: DashboardSummaryBlock, group: DashboardFilterGroup, filterId: string): void {
  group.filters = group.filters.filter((filter) => filter.id !== filterId)
  block.filterGroups = [...(block.filterGroups ?? [])]
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
      kind: block.kind === 'barChart' ? 'barChart' : 'metric',
      chartType: block.kind === 'barChart' ? 'bar' : undefined,
      groupByFieldCode: block.kind === 'barChart'
        ? validGroupFieldCode(block.entityId, block.groupByFieldCode)
        : undefined,
      order: index + 1,
      showInfo: hasSummaryInfo(block),
      description: block.description ?? '',
      widthPx: clampSummaryWidth(block, currentBlockWidthPx(block)),
      ...normalizeBlockConditions(block),
    }))
}

function normalizeBlockConditions(block: DashboardSummaryBlock): Pick<DashboardSummaryBlock, 'filters' | 'filterGroups'> {
  const filters = (block.filters ?? [])
    .map((filter) => ({
      ...filter,
      thenAction: normalizeThenAction(filter.thenAction),
    }))
    .slice(0, 1)

  if (filters.length > 0) {
    return {
      filters,
      filterGroups: [],
    }
  }

  return {
    filters: [],
    filterGroups: (block.filterGroups ?? [])
      .map((group) => ({
        ...group,
        thenAction: normalizeThenAction(group.thenAction),
        filters: group.filters ?? [],
      }))
      .slice(0, 1),
  }
}

function normalizeThenAction(value: unknown): DashboardThenAction {
  return value === 'green' || value === 'yellow' || value === 'red' ? value : 'none'
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
  if (block.kind === 'barChart') {
    const groupLabel = groupFieldOptions(block.entityId).find((option) => option.value === block.groupByFieldCode)?.label ?? 'полю'
    return `${schema?.name ?? 'Сущность'} · по ${groupLabel.toLocaleLowerCase('ru-RU')}`
  }
  if (block.metric === 'count') return schema?.name ?? 'Саммари'
  return field ? `${schema?.name ?? 'Сущность'} · ${field.name}` : schema?.name ?? 'Саммари'
}

function calculateSummaryValue(block: DashboardSummaryBlock): string {
  const value = calculateSummaryRawValue(block)
  return value === null ? '—' : formatNumber(value)
}

function calculateSummaryRawValue(block: DashboardSummaryBlock): number | null {
  return calculateMetricRawValue(block, filteredObjects(block))
}

function calculateMetricRawValue(block: DashboardSummaryBlock, objects: EntityObject[]): number | null {
  if (block.metric === 'count') return objects.length

  const values = objects.map((object) => object.values[block.fieldCode])
  if (block.metric === 'filled') return values.filter(isFilled).length
  if (block.metric === 'empty') return values.filter((value) => !isFilled(value)).length
  if (block.metric === 'unique') {
    const uniqueValues = new Set(values.filter(isFilled).map((value) => String(value)))
    return uniqueValues.size
  }

  const numericValues = values
    .filter(isFilled)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))

  if (numericValues.length === 0) return null
  if (block.metric === 'sum') return numericValues.reduce((sum, value) => sum + value, 0)
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
}

function chartBars(block: DashboardSummaryBlock): SummaryChartBar[] {
  if (block.kind !== 'barChart') return []
  const buckets = new Map<string, { label: string; objects: EntityObject[] }>()
  const groupFieldCode = validGroupFieldCode(block.entityId, block.groupByFieldCode)

  filteredObjects(block).forEach((object) => {
    const label = groupValueLabel(block, object, groupFieldCode)
    const bucket = buckets.get(label) ?? { label, objects: [] }
    bucket.objects.push(object)
    buckets.set(label, bucket)
  })

  const values = Array.from(buckets.values())
    .map((bucket) => ({
      label: bucket.label,
      value: calculateMetricRawValue(block, bucket.objects) ?? 0,
    }))
    .filter((bar) => Number.isFinite(bar.value))
    .sort((left, right) => right.value - left.value)
    .slice(0, 8)

  const maxValue = Math.max(...values.map((bar) => bar.value), 0)
  return values.map((bar) => ({
    ...bar,
    formattedValue: formatNumber(bar.value),
    widthPercent: maxValue > 0 ? Math.max(4, Math.round((bar.value / maxValue) * 100)) : 0,
  }))
}

function groupValueLabel(block: DashboardSummaryBlock, object: EntityObject, fieldCode: string): string {
  if (fieldCode === '__status') return statusOptions(block.entityId).find((option) => option.value === object.status)?.label ?? object.status ?? 'Без статуса'
  if (fieldCode === '__createdAt') return object.createdAt.slice(0, 10)
  if (fieldCode === '__updatedAt') return object.updatedAt.slice(0, 10)

  const field = fieldByCode(block.entityId, fieldCode)
  const value = object.values[fieldCode]
  if (!isFilled(value)) return 'Не указано'
  if (field?.type === 'boolean') return value === true ? 'Да' : 'Нет'
  if (field?.type === 'enum') {
    return platform.dictionaryById(field.enumId)?.items.find((item) => item.code === value)?.name ?? String(value)
  }
  if (field?.type === 'reference' && typeof value === 'string') {
    const referenceObject = platform.objectById(value)
    return referenceObject ? objectTitle(referenceObject) : value
  }
  if (field?.type === 'date' || field?.type === 'datetime') return String(value).slice(0, 10)
  return String(value)
}

function objectTitle(object: EntityObject): string {
  return String(object.values.name ?? object.values.title ?? object.values.number ?? object.values.address ?? object.id)
}

function defaultGroupFieldCode(entityId: string): string {
  return groupFieldOptions(entityId)[0]?.value ?? '__status'
}

function validGroupFieldCode(entityId: string, fieldCode?: string): string {
  const options = groupFieldOptions(entityId)
  return options.some((option) => option.value === fieldCode) ? String(fieldCode) : options[0]?.value ?? '__status'
}

function filteredObjects(block: DashboardSummaryBlock): EntityObject[] {
  const objectFilters = (block.filters ?? []).filter((filter) => filter.fieldCode !== SUMMARY_VALUE_FIELD_CODE)
  return platform.objectsByEntity(block.entityId).filter((object) =>
    objectFilters.every((filter) =>
      matchesDashboardFilter(object, filter, filterFieldKind(block, filter.fieldCode)),
    ),
  )
}

function isFilled(value: ObjectValue | string | undefined): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
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
    <div class="home-settings-actions">
      <UiButton
        label="Добавить показатель"
        icon="pi pi-plus"
        severity="secondary"
        variant="outlined"
        :disabled="availableSchemas.length === 0"
        @click="addBlock"
      />
      <UiButton
        label="Добавить график"
        icon="pi pi-chart-bar"
        severity="secondary"
        variant="outlined"
        :disabled="availableSchemas.length === 0"
        @click="addChartBlock"
      />
      <UiButton label="Сохранить" icon="pi pi-save" :loading="saving" @click="save" />
    </div>

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
          title="Виджеты не настроены"
          description="Создайте первый блок для главного экрана."
        >
          <UiButton label="Добавить показатель" icon="pi pi-plus" @click="addBlock" />
        </UiEmptyState>

        <div v-else class="dashboard-summary" @dragover.prevent @drop="dropAtEnd">
          <section v-for="group in previewGroups" :key="group.schema.id" class="summary-entity-section">
            <div class="summary-entity-section__header">
              <h3>{{ group.schema.name }}</h3>
            </div>

            <div class="summary-grid">
              <article
                v-for="summary in group.blocks"
                :key="summary.block.id"
                class="summary-card summary-card--editor"
                :class="{
                  'summary-card--chart': summary.block.kind === 'barChart',
                  'summary-card--selected': selectedBlock?.id === summary.block.id,
                  'summary-card--dragging': draggedBlockId === summary.block.id,
                  'summary-card--resizing': resizingBlockId === summary.block.id,
                  'summary-card--has-info': hasSummaryInfo(summary.block),
                  'summary-card--then-green': summary.thenAction === 'green',
                  'summary-card--then-yellow': summary.thenAction === 'yellow',
                  'summary-card--then-red': summary.thenAction === 'red',
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
                <template v-if="summary.block.kind === 'barChart'">
                  <span class="summary-card__title">{{ summary.title }}</span>
                  <div class="summary-chart">
                    <div v-if="summary.bars.length === 0" class="summary-chart__empty">Нет данных</div>
                    <div v-for="bar in summary.bars" :key="bar.label" class="summary-chart__row">
                      <span>{{ bar.label }}</span>
                      <div class="summary-chart__track">
                        <i :style="{ width: `${bar.widthPercent}%` }" />
                      </div>
                      <strong>{{ bar.formattedValue }}</strong>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <span class="summary-card__title">{{ summary.title }}</span>
                  <strong>{{ summary.value }}</strong>
                </template>
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
            <div class="summary-inspector__title">
              <h3 class="surface-title">Настройка виджета</h3>
              <p>Название, расчёт и правила подсветки карточки на главной.</p>
            </div>
            <UiButton label="Удалить" severity="danger" variant="outlined" @click="deleteBlock(selectedBlock.id)" />
          </div>

          <section class="summary-panel">
            <div class="summary-panel__header">
                <span class="summary-panel__step">1</span>
                <div>
                  <h4>Настройки блока</h4>
                  <p>Определяют источник данных, расчёт и формат виджета.</p>
                </div>
              </div>

            <div class="summary-inspector__form">
              <div class="form-field full">
                <label>Тип виджета</label>
                <UiSelect
                  :model-value="selectedBlock.kind"
                  :options="blockKindOptions"
                  @update:model-value="setBlockKind(selectedBlock, $event)"
                />
              </div>

              <div class="form-field full">
                <label>Название</label>
                <UiInput v-model="selectedBlock.title" />
              </div>

              <div class="form-field full">
                <label>Описание для подсказки</label>
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

              <div class="form-field full">
                <label>{{ selectedBlock.kind === 'barChart' ? 'Поле значения' : 'Поле расчёта' }}</label>
                <UiSelect
                  :model-value="selectedBlock.fieldCode"
                  :options="metricFieldOptions(selectedBlock.entityId)"
                  :disabled="selectedBlock.metric === 'count'"
                  @update:model-value="setBlockField(selectedBlock, $event)"
                />
              </div>

              <div v-if="selectedBlock.kind === 'barChart'" class="form-field full">
                <label>Группировать по</label>
                <UiSelect
                  :model-value="selectedBlock.groupByFieldCode ?? defaultGroupFieldCode(selectedBlock.entityId)"
                  :options="groupFieldOptions(selectedBlock.entityId)"
                  @update:model-value="setBlockGroupField(selectedBlock, $event)"
                />
              </div>
            </div>
          </section>

          <section class="summary-panel summary-filter-section">
            <div class="summary-filter-section__header">
              <div class="summary-panel__header">
                <span class="summary-panel__step">2</span>
                <div>
                  <h4>Условия</h4>
                  <p>Выберите один сценарий подсветки: одиночное правило или группу правил.</p>
                </div>
              </div>
            </div>

            <div class="condition-mode-grid" aria-label="Тип условия">
              <button
                type="button"
                class="condition-mode-card"
                :class="{ active: selectedBlock.filters.length > 0 }"
                :disabled="selectedBlock.filterGroups.length > 0"
                @click="addFilter(selectedBlock)"
              >
                <strong>Одно условие</strong>
              </button>
              <button
                type="button"
                class="condition-mode-card"
                :class="{ active: selectedBlock.filterGroups.length > 0 }"
                :disabled="selectedBlock.filters.length > 0"
                @click="addFilterGroup(selectedBlock)"
              >
                <strong>Группа условий</strong>
              </button>
            </div>

            <div v-if="selectedBlock.filters.length === 0 && selectedBlock.filterGroups.length === 0" class="summary-filter-empty">
              Условия не заданы. Выберите сценарий выше, если виджет нужно подсвечивать по светофорному правилу.
            </div>

            <div v-if="selectedBlock.filters.length > 0" class="summary-filter-list">
              <article v-for="filter in selectedBlock.filters" :key="filter.id" class="summary-filter-row">
                <div class="form-field">
                  <label>Поле</label>
                  <UiSelect
                    :model-value="filter.fieldCode"
                    :options="filterFieldOptions(selectedBlock)"
                    @update:model-value="setFilterField(selectedBlock, filter, $event)"
                  />
                </div>

                <div class="form-field summary-filter-condition-field">
                  <label>Условие</label>
                  <UiSelect
                    :model-value="filter.operator"
                    :options="filterOperatorOptions(selectedBlock, filter)"
                    @update:model-value="setFilterOperator(selectedBlock, filter, $event)"
                  />
                  <UiSelect
                    v-if="needsFilterValue(filter.operator) && hasSelectValue(selectedBlock, filter)"
                    v-model="filter.value"
                    :options="filterValueOptions(selectedBlock, filter)"
                  />
                  <UiInput v-else-if="needsFilterValue(filter.operator)" v-model="filter.value" />
                </div>

                <div class="form-field">
                  <label>Тогда</label>
                  <UiSelect v-model="filter.thenAction" :options="thenActionOptions" />
                </div>
                <UiButton label="Удалить" severity="danger" variant="outlined" @click="deleteFilter(selectedBlock, filter.id)" />
              </article>
            </div>

            <div v-if="selectedBlock.filterGroups.length > 0" class="summary-filter-list">
              <article v-for="group in selectedBlock.filterGroups" :key="group.id" class="summary-filter-group">
                <div class="summary-filter-group__header">
                  <div>
                    <h4>Группа условий</h4>
                    <p>Все условия внутри группы должны выполниться одновременно.</p>
                  </div>
                  <div class="summary-filter-section__actions">
                    <UiButton label="Добавить строку" icon="pi pi-plus" severity="secondary" variant="outlined" @click="addGroupFilter(selectedBlock, group)" />
                    <UiButton label="Удалить группу" severity="danger" variant="outlined" @click="deleteFilterGroup(selectedBlock, group.id)" />
                  </div>
                </div>

                <div class="form-field">
                  <label>Тогда</label>
                  <UiSelect v-model="group.thenAction" :options="thenActionOptions" />
                </div>

                <article v-for="filter in group.filters" :key="filter.id" class="summary-filter-row summary-filter-row--nested">
                  <div class="form-field">
                    <label>Поле</label>
                    <UiSelect
                      :model-value="filter.fieldCode"
                      :options="filterFieldOptions(selectedBlock)"
                      @update:model-value="setFilterField(selectedBlock, filter, $event)"
                    />
                  </div>

                  <div class="form-field summary-filter-condition-field">
                    <label>Условие</label>
                    <UiSelect
                      :model-value="filter.operator"
                      :options="filterOperatorOptions(selectedBlock, filter)"
                      @update:model-value="setFilterOperator(selectedBlock, filter, $event)"
                    />
                    <UiSelect
                      v-if="needsFilterValue(filter.operator) && hasSelectValue(selectedBlock, filter)"
                      v-model="filter.value"
                      :options="filterValueOptions(selectedBlock, filter)"
                    />
                    <UiInput v-else-if="needsFilterValue(filter.operator)" v-model="filter.value" />
                  </div>

                  <UiButton label="Удалить" severity="danger" variant="outlined" @click="deleteGroupFilter(selectedBlock, group, filter.id)" />
                </article>
              </article>
            </div>
          </section>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.home-settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 14px;
}

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
  align-items: flex-start;
  gap: 12px;
}

.summary-inspector__title {
  min-width: 0;
}

.summary-inspector__title p {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.summary-panel {
  display: grid;
  gap: 14px;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(180deg, rgba(249, 250, 251, 0.72), rgba(255, 255, 255, 0.96)),
    var(--color-surface);
}

.summary-panel__header {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.summary-panel__step {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 800;
}

.summary-panel__header h4 {
  margin: 0;
  color: var(--color-text);
  font-size: 14px;
  line-height: 1.2;
}

.summary-panel__header p {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.summary-filter-section__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.summary-filter-section__header {
  align-items: flex-start;
  flex-wrap: wrap;
}

.summary-filter-section__header > .summary-filter-section__actions {
  width: 100%;
  justify-content: stretch;
}

.summary-filter-section__actions :deep(.p-button) {
  flex: 1 1 150px;
  justify-content: center;
  min-width: 0;
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
  overflow: visible;
}

.summary-card {
  position: relative;
  z-index: 0;
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

.summary-card:hover,
.summary-card:focus-within {
  z-index: 30;
}

.summary-card--then-green,
.summary-card--then-yellow,
.summary-card--then-red {
  border-color: var(--summary-signal-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.84),
    0 10px 24px var(--summary-signal-shadow);
}

.summary-card--then-green::before,
.summary-card--then-yellow::before,
.summary-card--then-red::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 5px;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background: linear-gradient(90deg, var(--summary-signal), var(--summary-signal-soft));
  pointer-events: none;
}

.summary-card--then-green .summary-card__title,
.summary-card--then-yellow .summary-card__title,
.summary-card--then-red .summary-card__title,
.summary-card--then-green strong,
.summary-card--then-yellow strong,
.summary-card--then-red strong {
  color: var(--summary-signal-text);
}

.summary-card--then-green {
  --summary-signal: #16a34a;
  --summary-signal-soft: #86efac;
  --summary-signal-border: #4ade80;
  --summary-signal-shadow: rgba(22, 163, 74, 0.16);
  --summary-signal-text: #14532d;
  background:
    linear-gradient(180deg, rgba(22, 163, 74, 0.18) 0%, rgba(22, 163, 74, 0.08) 58%, rgba(255, 255, 255, 0.96) 100%),
    #f0fdf4;
}

.summary-card--then-yellow {
  --summary-signal: #d97706;
  --summary-signal-soft: #fcd34d;
  --summary-signal-border: #fbbf24;
  --summary-signal-shadow: rgba(217, 119, 6, 0.16);
  --summary-signal-text: #78350f;
  background:
    linear-gradient(180deg, rgba(217, 119, 6, 0.2) 0%, rgba(217, 119, 6, 0.09) 58%, rgba(255, 255, 255, 0.96) 100%),
    #fffbeb;
}

.summary-card--then-red {
  --summary-signal: #dc2626;
  --summary-signal-soft: #fca5a5;
  --summary-signal-border: #f87171;
  --summary-signal-shadow: rgba(220, 38, 38, 0.16);
  --summary-signal-text: #7f1d1d;
  background:
    linear-gradient(180deg, rgba(220, 38, 38, 0.18) 0%, rgba(220, 38, 38, 0.08) 58%, rgba(255, 255, 255, 0.96) 100%),
    #fef2f2;
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
  z-index: 20;
  overflow: visible;
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
  z-index: 40;
  width: min(280px, 60vw);
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
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

.summary-card > strong {
  display: block;
  align-self: center;
  justify-self: center;
  text-align: center;
  font-size: 30px;
  line-height: 1;
}

.summary-card--chart {
  min-height: 220px;
  grid-template-rows: auto minmax(0, 1fr);
}

.summary-chart {
  display: grid;
  gap: 8px;
  align-self: stretch;
  min-width: 0;
}

.summary-chart__row {
  display: grid;
  grid-template-columns: minmax(82px, 0.9fr) minmax(90px, 1.6fr) 44px;
  gap: 8px;
  align-items: center;
  min-width: 0;
  font-size: 12px;
}

.summary-chart__row > span {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-chart__row strong {
  color: var(--color-text);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  text-align: right;
}

.summary-chart__track {
  height: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-surface-muted);
}

.summary-chart__track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2563eb, #60a5fa);
}

.summary-chart__empty {
  align-self: center;
  justify-self: center;
  color: var(--color-text-secondary);
  font-size: 13px;
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
  gap: 12px;
}

.summary-inspector__form .form-field {
  gap: 6px;
}

.summary-filter-section {
  gap: 14px;
}

.summary-filter-empty {
  padding: 12px;
  border-radius: var(--radius-md);
  border: 1px dashed var(--color-border);
  background: rgba(249, 250, 251, 0.72);
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.condition-mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.condition-mode-card {
  min-width: 0;
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease, transform 150ms ease;
}

.condition-mode-card strong {
  font-size: 13px;
  line-height: 1.25;
}

.condition-mode-card:hover:not(:disabled),
.condition-mode-card:focus-visible {
  border-color: #93c5fd;
  background: #eff6ff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  outline: none;
  transform: translateY(-1px);
}

.condition-mode-card.active {
  border-color: var(--color-accent);
  background:
    linear-gradient(180deg, rgba(37, 99, 235, 0.1), rgba(239, 246, 255, 0.78)),
    var(--color-surface);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.condition-mode-card:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.summary-filter-list {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.summary-filter-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-items: end;
  min-width: 0;
  padding: 10px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(249, 250, 251, 0.88);
}

.summary-filter-row--nested {
  background: var(--color-surface);
}

.summary-filter-condition-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  min-width: 0;
}

.summary-filter-condition-field label {
  grid-column: auto;
}

.summary-filter-row .form-field,
.summary-filter-group .form-field {
  min-width: 0;
}

.summary-filter-row :deep(.p-select),
.summary-filter-row :deep(.p-inputtext),
.summary-filter-group :deep(.p-select),
.summary-filter-group :deep(.p-inputtext) {
  width: 100%;
  min-width: 0;
}

.summary-filter-row :deep(.p-button) {
  width: 100%;
  justify-content: center;
}

.summary-filter-group {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  overflow: hidden;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-md);
  background:
    linear-gradient(180deg, rgba(239, 246, 255, 0.8), rgba(255, 255, 255, 0.96)),
    #f8fbff;
}

.summary-filter-group__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: flex-start;
  gap: 10px;
}

.summary-filter-group__header h4 {
  margin: 0;
  font-size: 14px;
}

.summary-filter-group__header p {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

@media (min-width: 640px) {
  .summary-filter-condition-field {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  }

  .summary-filter-condition-field label {
    grid-column: 1 / -1;
  }

  .summary-filter-row :deep(.p-button) {
    width: auto;
  }
}

@media (max-width: 1280px) {
  .home-settings-layout {
    grid-template-columns: 1fr;
  }

  .summary-inspector {
    position: static;
  }
}

@media (max-width: 760px) {
  .summary-inspector__form,
  .condition-mode-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1180px) {
  .summary-grid {
    flex-wrap: wrap;
  }
}
</style>
