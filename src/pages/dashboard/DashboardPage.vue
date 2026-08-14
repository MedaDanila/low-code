<script setup lang="ts">
import { computed } from 'vue'
import { Info } from '@lucide/vue'
import { useRouter } from 'vue-router'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import { matchesDashboardFilter, type DashboardFilterFieldKind } from '../../shared/lib/dashboardFilters'
import { usePermissions } from '../../shared/lib/usePermissions'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import type {
  DashboardFilter,
  DashboardFilterGroup,
  DashboardFilterOperator,
  DashboardSummaryBlock,
  DashboardThenAction,
  EntityField,
  EntityObject,
  EntitySchema,
  ObjectValue,
} from '../../shared/types/domain'

interface SummaryView {
  block: DashboardSummaryBlock
  schema: EntitySchema
  title: string
  value: string
  thenAction: DashboardThenAction
}

interface SummaryGroup {
  schema: EntitySchema
  blocks: SummaryView[]
}

const router = useRouter()
const auth = useAuthStore()
const platform = usePlatformStore()
const permissions = usePermissions()
const summaryWidthStepPx = 10
const defaultSummaryWidthPx = 220
const maxSummaryWidthPx = 960

const currentUserSettings = computed(() =>
  auth.currentUser ? platform.userSettingsByUser(auth.currentUser.id) : undefined,
)

const configuredBlocks = computed(() =>
  [...(currentUserSettings.value?.home.summaryBlocks ?? [])]
    .sort((first, second) => first.order - second.order)
    .filter((block) => Boolean(platform.schemaById(block.entityId))),
)
const visibleRuntimeSchemas = computed(() =>
  platform.runtimeSchemas.filter((schema) => permissions.can('view', schema.id)),
)

const summaryGroups = computed<SummaryGroup[]>(() => {
  const groups = new Map<string, SummaryGroup>()

  configuredBlocks.value.forEach((block) => {
    const schema = platform.schemaById(block.entityId)
    if (!schema || !permissions.can('view', schema.id)) return

    if (!groups.has(schema.id)) {
      groups.set(schema.id, {
        schema,
        blocks: [],
      })
    }

    groups.get(schema.id)?.blocks.push({
      block,
      schema,
      title: block.title || defaultSummaryTitle(block, schema),
      value: calculateSummaryValue(block),
      thenAction: summaryThenAction(block),
    })
  })

  return Array.from(groups.values())
})

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

function isFilled(value: ObjectValue | undefined): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function defaultSummaryTitle(block: DashboardSummaryBlock, schema: EntitySchema): string {
  if (block.metric === 'count') return schema.name
  const fieldName = schema.fields.find((field) => field.code === block.fieldCode)?.name
  return fieldName ? `${schema.name} · ${fieldName}` : schema.name
}

function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
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
  const schema = platform.schemaById(block.entityId)
  const title = (block.title || (schema ? defaultSummaryTitle(block, schema) : '')).trim() || 'Название блока'
  const textWidth = measureTitleWidth(title)
  const controlWidth = hasSummaryInfo(block) ? 62 : 32
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

function fieldByCode(entityId: string, fieldCode: string): EntityField | undefined {
  return platform.schemaById(entityId)?.fields.find((field) => field.code === fieldCode)
}

function filterFieldKind(block: DashboardSummaryBlock, fieldCode: string): DashboardFilterFieldKind {
  if (fieldCode === '__createdAt' || fieldCode === '__updatedAt') return 'date'
  if (fieldCode === '__status') return 'status'

  const field = fieldByCode(block.entityId, fieldCode)
  if (field?.type === 'date' || field?.type === 'datetime') return 'date'
  if (field?.type === 'enum' || field?.type === 'reference') return 'enum'
  if (field?.type === 'boolean') return 'boolean'
  if (field?.type === 'integer' || field?.type === 'decimal') return 'number'
  return 'text'
}

function needsFilterValue(operator: DashboardFilterOperator): boolean {
  return !['filled', 'empty', 'today', 'beforeToday', 'afterToday'].includes(operator)
}

function summaryThenAction(block: DashboardSummaryBlock): DashboardThenAction {
  const actions = [
    ...(block.filters ?? [])
      .filter((filter) => filter.thenAction && filter.thenAction !== 'none' && filterMatchesAnyObject(block, filter))
      .map((filter) => filter.thenAction ?? 'none'),
    ...(block.filterGroups ?? [])
      .filter((group) => group.thenAction !== 'none' && groupMatchesAnyObject(block, group))
      .map((group) => group.thenAction),
  ]

  if (actions.includes('red')) return 'red'
  if (actions.includes('yellow')) return 'yellow'
  if (actions.includes('green')) return 'green'
  return 'none'
}

function filterMatchesAnyObject(block: DashboardSummaryBlock, filter: DashboardFilter): boolean {
  return platform.objectsByEntity(block.entityId).some((object) =>
    matchesDashboardFilter(object, filter, filterFieldKind(block, filter.fieldCode)),
  )
}

function groupMatchesAnyObject(block: DashboardSummaryBlock, group: DashboardFilterGroup): boolean {
  return platform.objectsByEntity(block.entityId).some((object) =>
    group.filters.every((filter) =>
      matchesDashboardFilter(object, filter, filterFieldKind(block, filter.fieldCode)),
    ),
  )
}

function thenActionLabel(action: DashboardThenAction): string {
  if (action === 'green') return 'Зелёный'
  if (action === 'yellow') return 'Жёлтый'
  if (action === 'red') return 'Красный'
  return 'Ничего'
}

function quoteValue(value: string): string {
  return `«${value}»`
}

function lowerFirst(value: string): string {
  return value ? value[0].toLocaleLowerCase('ru-RU') + value.slice(1) : value
}

function filteredObjects(block: DashboardSummaryBlock): EntityObject[] {
  return platform.objectsByEntity(block.entityId).filter((object) =>
    (block.filters ?? []).every((filter) =>
      matchesDashboardFilter(object, filter, filterFieldKind(block, filter.fieldCode)),
    ),
  )
}
</script>

<template>
  <div>
    <UiEmptyState
      v-if="visibleRuntimeSchemas.length === 0"
      title="Данных пока нет"
      description="Создайте и опубликуйте первую сущность, затем добавьте объекты или импортируйте данные."
    >
      <UiButton label="Создать сущность" icon="pi pi-plus" @click="router.push('/admin/entities/new')" />
    </UiEmptyState>

    <UiEmptyState
      v-else-if="summaryGroups.length === 0"
      title="Саммари не настроены"
      description="Добавьте блоки для главного экрана в настройках."
    >
      <UiButton label="Настроить" icon="pi pi-cog" @click="router.push('/admin/home')" />
    </UiEmptyState>

    <div v-else class="dashboard-summary">
      <section v-for="group in summaryGroups" :key="group.schema.id" class="summary-entity-section">
        <div class="summary-entity-section__header">
          <h3>{{ group.schema.name }}</h3>
        </div>

        <div class="summary-grid">
          <article
            v-for="summary in group.blocks"
            :key="summary.block.id"
            class="summary-card"
            :class="{
              'summary-card--has-info': hasSummaryInfo(summary.block),
              'summary-card--then-green': summary.thenAction === 'green',
              'summary-card--then-yellow': summary.thenAction === 'yellow',
              'summary-card--then-red': summary.thenAction === 'red',
            }"
            :style="summaryCardStyle(summary.block)"
          >
            <button
              v-if="hasSummaryInfo(summary.block)"
              class="summary-card__info"
              type="button"
              aria-label="Описание расчёта"
            >
              <Info :size="14" />
              <span class="summary-card__tooltip">{{ summaryInfoText(summary.block) }}</span>
            </button>
            <span class="summary-card__title">{{ summary.title }}</span>
            <strong>{{ summary.value }}</strong>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
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

.summary-card--has-info .summary-card__title {
  padding-right: 30px;
}

.summary-card__info {
  position: absolute;
  top: 12px;
  right: 12px;
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

.summary-card strong {
  display: block;
  align-self: center;
  justify-self: center;
  text-align: center;
  font-size: 30px;
  line-height: 1;
}

@media (max-width: 1180px) {
  .summary-grid {
    flex-wrap: wrap;
  }
}
</style>
