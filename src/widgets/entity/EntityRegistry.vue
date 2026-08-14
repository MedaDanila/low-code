<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import UiToolbar from '../../shared/ui/UiToolbar.vue'
import { formatDate, formatValue } from '../../shared/lib/format'
import { matchesDashboardFilter, type DashboardFilterFieldKind } from '../../shared/lib/dashboardFilters'
import { createId } from '../../shared/lib/id'
import { usePermissions } from '../../shared/lib/usePermissions'
import { usePlatformStore } from '../../stores/platform'
import type { DashboardFilter, DashboardFilterOperator, EntityField, EntityObject, EntitySchema } from '../../shared/types/domain'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{
  schema: EntitySchema
  objects: EntityObject[]
  loading?: boolean
}>()

const router = useRouter()
const toast = useToast()
const platform = usePlatformStore()
const permissions = usePermissions()
const search = ref('')
const status = ref<string | number | boolean | null>('all')
const filtersOpen = ref(false)
const filters = ref<DashboardFilter[]>([])
const openActionMenuId = ref('')
const actionMenuStyle = ref<Record<string, string>>({})

const visibleFields = computed(() => props.schema.fields.filter((field) => field.listVisible).sort((a, b) => a.order - b.order))
const filterableFields = computed(() => props.schema.fields.filter((field) => field.filterable).sort((a, b) => a.order - b.order))
const columns = computed(() => [
  ...visibleFields.value.map((field) => ({ field: field.code, header: field.name, sortable: true })),
  { field: 'status', header: 'Статус', sortable: true, width: '148px' },
  { field: 'actions', header: '', sortable: false, width: '64px' },
])

const statusOptions = [
  { label: 'Все статусы', value: 'all' },
  { label: 'Опубликовано', value: 'published' },
  { label: 'Черновик', value: 'draft' },
]

const filterFieldOptions = computed(() => filterableFields.value.map((field) => ({ label: field.name, value: field.code })))
const activeFilters = computed(() => filters.value.filter(isReadyFilter))
const activeFilterCount = computed(() => activeFilters.value.length)
const filterButtonLabel = computed(() => (activeFilterCount.value > 0 ? `Фильтры · ${activeFilterCount.value}` : 'Фильтры'))
const hasActiveCriteria = computed(() =>
  Boolean(search.value.trim())
  || status.value !== 'all'
  || activeFilterCount.value > 0,
)
const emptyTitle = computed(() => (hasActiveCriteria.value ? 'Ничего не найдено' : 'Объектов пока нет'))
const emptyDescription = computed(() =>
  hasActiveCriteria.value
    ? 'Измените поисковый запрос, статус или условия фильтрации.'
    : 'После создания объект появится в реестре и на карте, если у сущности есть геометрия.',
)

const filteredObjects = computed(() =>
  props.objects
    .filter((object) => {
      const query = search.value.trim().toLowerCase()
      const statusMatches = status.value === 'all' || object.status === status.value
      const filtersMatch = activeFilters.value.every((filter) => matchesDashboardFilter(object, filter, filterFieldKind(filter.fieldCode)))
      if (!query) return statusMatches && filtersMatch
      const searchableText = props.schema.fields
        .filter((field) => field.searchable)
        .map((field) => [object.values[field.code], formattedFieldValue(object, field)].join(' '))
        .join(' ')
        .toLowerCase()
      return statusMatches && filtersMatch && searchableText.includes(query)
    })
)

const rows = computed(() => filteredObjects.value.map((object) => objectToRow(object)))

watch(
  () => props.schema.id,
  () => {
    search.value = ''
    status.value = 'all'
    filters.value = []
    filtersOpen.value = false
    openActionMenuId.value = ''
  },
)

function openRow(row: Record<string, unknown>) {
  const object = row.__object as EntityObject
  openActionMenuId.value = ''
  router.push(`/app/entities/${props.schema.code}/${object.id}`)
}

function createObject() {
  router.push(`/app/entities/${props.schema.code}/new`)
}

async function removeObject(object: EntityObject) {
  openActionMenuId.value = ''
  const title = objectTitle(object)
  const confirmed = window.confirm(`Удалить запись «${title}»?`)
  if (!confirmed) return
  await platform.deleteObject(object.id)
  toast.add({ severity: 'success', summary: 'Запись удалена', detail: title, life: 2400 })
}

function toggleActionMenu(objectId: string, event: MouseEvent) {
  openActionMenuId.value = openActionMenuId.value === objectId ? '' : objectId
  if (!openActionMenuId.value) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const menuWidth = 150
  actionMenuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth))}px`,
  }
}

function objectTitle(object: EntityObject): string {
  return String(object.values.name ?? object.values.title ?? object.values.address ?? object.id)
}

function objectToRow(object: EntityObject): Record<string, unknown> {
  const row: Record<string, unknown> = { id: object.id, status: object.status, __object: object }
  visibleFields.value.forEach((field) => {
    row[field.code] = formattedFieldValue(object, field)
  })
  return row
}

function formattedFieldValue(object: EntityObject, field: EntityField): string {
  const raw = object.values[field.code]
  const enumLabel = platform.dictionaryById(field.enumId)?.items.find((item) => item.code === raw)?.name
  return String(field.type === 'date' || field.type === 'datetime' ? formatDate(raw) : enumLabel ?? formatValue(raw))
}

function addFilter(): void {
  const fieldCode = filterFieldOptions.value[0]?.value
  if (!fieldCode) return
  const filter: DashboardFilter = {
    id: createId('flt'),
    fieldCode,
    operator: defaultFilterOperator(fieldCode),
    value: '',
  }
  filter.value = defaultFilterValue(filter)
  filters.value.push(filter)
  filtersOpen.value = true
}

function removeFilter(filterId: string): void {
  filters.value = filters.value.filter((filter) => filter.id !== filterId)
}

function clearFilters(): void {
  filters.value = []
}

function updateFilterField(filter: DashboardFilter, value: string | number | boolean | null): void {
  filter.fieldCode = String(value ?? filterFieldOptions.value[0]?.value ?? '')
  filter.operator = defaultFilterOperator(filter.fieldCode)
  filter.value = defaultFilterValue(filter)
}

function updateFilterOperator(filter: DashboardFilter, value: string | number | boolean | null): void {
  filter.operator = String(value ?? defaultFilterOperator(filter.fieldCode)) as DashboardFilterOperator
  filter.value = needsFilterValue(filter.operator) ? filter.value : ''
}

function isReadyFilter(filter: DashboardFilter): boolean {
  return Boolean(filter.fieldCode) && (!needsFilterValue(filter.operator) || Boolean(filter.value.trim()))
}

function filterFieldKind(fieldCode: string): DashboardFilterFieldKind {
  const field = props.schema.fields.find((item) => item.code === fieldCode)
  if (field?.type === 'date' || field?.type === 'datetime') return 'date'
  if (field?.type === 'enum' || field?.type === 'reference') return 'enum'
  if (field?.type === 'boolean') return 'boolean'
  if (field?.type === 'integer' || field?.type === 'decimal') return 'number'
  return 'text'
}

function filterOperatorOptions(filter: DashboardFilter): Array<{ label: string; value: DashboardFilterOperator }> {
  const kind = filterFieldKind(filter.fieldCode)
  if (kind === 'date') {
    return [
      { label: 'Равно дате', value: 'equals' },
      { label: 'Раньше даты', value: 'before' },
      { label: 'Позже даты', value: 'after' },
      { label: 'Сегодня', value: 'today' },
      { label: 'Раньше сегодня', value: 'beforeToday' },
      { label: 'Позже сегодня', value: 'afterToday' },
      { label: 'Заполнено', value: 'filled' },
      { label: 'Пусто', value: 'empty' },
    ]
  }

  if (kind === 'enum' || kind === 'boolean') {
    return [
      { label: 'Равно', value: 'equals' },
      { label: 'Не равно', value: 'notEquals' },
      { label: 'Заполнено', value: 'filled' },
      { label: 'Пусто', value: 'empty' },
    ]
  }

  return [
    ...(kind === 'text' ? [{ label: 'Содержит', value: 'contains' as DashboardFilterOperator }] : []),
    { label: 'Равно', value: 'equals' },
    { label: 'Не равно', value: 'notEquals' },
    ...(kind === 'number'
      ? [
          { label: 'Больше', value: 'after' as DashboardFilterOperator },
          { label: 'Меньше', value: 'before' as DashboardFilterOperator },
        ]
      : []),
    { label: 'Заполнено', value: 'filled' },
    { label: 'Пусто', value: 'empty' },
  ]
}

function filterValueOptions(filter: DashboardFilter): Array<{ label: string; value: string }> {
  const kind = filterFieldKind(filter.fieldCode)
  if (kind === 'boolean') {
    return [
      { label: 'Да', value: 'true' },
      { label: 'Нет', value: 'false' },
    ]
  }

  const field = props.schema.fields.find((item) => item.code === filter.fieldCode)
  if (kind === 'enum' && field?.enumId) {
    return platform.dictionaryById(field.enumId)?.items
      .filter((item) => item.active)
      .map((item) => ({ label: item.name, value: item.code })) ?? []
  }

  return []
}

function hasSelectValue(filter: DashboardFilter): boolean {
  return filterValueOptions(filter).length > 0
}

function needsFilterValue(operator: DashboardFilterOperator): boolean {
  return !['filled', 'empty', 'today', 'beforeToday', 'afterToday'].includes(operator)
}

function defaultFilterOperator(fieldCode: string): DashboardFilterOperator {
  const kind = filterFieldKind(fieldCode)
  if (kind === 'text') return 'contains'
  return 'equals'
}

function defaultFilterValue(filter: DashboardFilter): string {
  if (!needsFilterValue(filter.operator)) return ''
  return ''
}

function todayKey(): string {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function exportRows(): void {
  if (filteredObjects.value.length === 0) {
    toast.add({ severity: 'warn', summary: 'Нет строк для экспорта', detail: 'Измените фильтры или поиск.', life: 2600 })
    return
  }

  const exportColumns = [
    ...visibleFields.value.map((field) => ({
      header: field.name,
      value: (object: EntityObject) => formattedFieldValue(object, field),
    })),
    {
      header: 'Статус',
      value: (object: EntityObject) => statusOptions.find((option) => option.value === object.status)?.label ?? object.status ?? '',
    },
  ]
  const csvRows = [
    exportColumns.map((column) => csvCell(column.header)).join(';'),
    ...filteredObjects.value.map((object) => exportColumns.map((column) => csvCell(column.value(object))).join(';')),
  ]
  const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeFileName(props.schema.code || props.schema.name)}-${todayKey()}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  toast.add({ severity: 'success', summary: 'Экспорт подготовлен', detail: `${filteredObjects.value.length} строк`, life: 2200 })
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function safeFileName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-zа-яё0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'export'
}
</script>

<template>
  <div class="registry">
    <UiToolbar class="registry-toolbar">
      <div class="registry-toolbar__search">
        <UiInput v-model="search" placeholder="Поиск по полям" />
      </div>
      <UiSelect v-model="status" :options="statusOptions" />
      <UiButton
        :label="filterButtonLabel"
        icon="pi pi-filter"
        :severity="activeFilterCount > 0 ? undefined : 'secondary'"
        :variant="activeFilterCount > 0 ? undefined : 'outlined'"
        :disabled="filterableFields.length === 0"
        @click="filtersOpen = !filtersOpen"
      />
      <template #actions>
        <UiButton label="Экспорт" icon="pi pi-download" severity="secondary" variant="outlined" @click="exportRows" />
        <UiButton
          v-if="permissions.can('create', schema.id)"
          :label="`Создать ${schema.name.toLowerCase()}`"
          icon="pi pi-plus"
          @click="createObject"
        />
      </template>
    </UiToolbar>

    <section v-if="filtersOpen" class="registry-filters">
      <div class="registry-filters__header">
        <div>
          <h3>Фильтры по полям</h3>
          <p>Все условия применяются одновременно и учитываются при экспорте.</p>
        </div>
        <div class="registry-filters__actions">
          <UiButton label="Добавить условие" icon="pi pi-plus" severity="secondary" variant="outlined" @click="addFilter" />
          <UiButton v-if="filters.length > 0" label="Сбросить" severity="secondary" variant="text" @click="clearFilters" />
        </div>
      </div>

      <p v-if="filterableFields.length === 0" class="registry-filters__empty">У этой сущности нет полей, доступных для фильтрации.</p>
      <p v-else-if="filters.length === 0" class="registry-filters__empty">Добавьте условие, чтобы сузить список записей.</p>

      <div v-else class="registry-filters__list">
        <article v-for="filter in filters" :key="filter.id" class="registry-filter-row">
          <div class="form-field">
            <label>Поле</label>
            <UiSelect
              :model-value="filter.fieldCode"
              :options="filterFieldOptions"
              @update:model-value="updateFilterField(filter, $event)"
            />
          </div>
          <div class="form-field">
            <label>Условие</label>
            <UiSelect
              :model-value="filter.operator"
              :options="filterOperatorOptions(filter)"
              @update:model-value="updateFilterOperator(filter, $event)"
            />
          </div>
          <div v-if="needsFilterValue(filter.operator)" class="form-field">
            <label>Значение</label>
            <UiSelect
              v-if="hasSelectValue(filter)"
              v-model="filter.value"
              :options="filterValueOptions(filter)"
            />
            <input
              v-else-if="filterFieldKind(filter.fieldCode) === 'date'"
              v-model="filter.value"
              class="registry-filter__input"
              type="date"
            >
            <UiInput v-else v-model="filter.value" :placeholder="filterFieldKind(filter.fieldCode) === 'number' ? 'Например, 10' : 'Введите значение'" />
          </div>
          <div v-else class="registry-filter-row__spacer" aria-hidden="true" />
          <UiButton label="Удалить" severity="danger" variant="outlined" @click="removeFilter(filter.id)" />
        </article>
      </div>
    </section>

    <UiEmptyState
      v-if="!loading && rows.length === 0"
      :title="emptyTitle"
      :description="emptyDescription"
    />
    <UiTable
      v-else
      :rows="rows"
      :columns="columns"
      :loading="loading"
      empty-message="Нет объектов"
      @row-click="openRow"
    >
      <template #cell="{ row, column }">
        <StatusBadge v-if="column.field === 'status'" :status="String(row.status ?? '')" />
        <div v-else-if="column.field === 'actions'" class="registry-actions" @click.stop>
          <button
            class="registry-actions__trigger"
            type="button"
            aria-label="Действия"
            @click="toggleActionMenu(String(row.id), $event)"
          >
            ⋯
          </button>
          <Teleport to="body">
            <div v-if="openActionMenuId === row.id" class="registry-actions__menu" :style="actionMenuStyle">
              <button type="button" @click="openRow(row)">Открыть</button>
              <button
                v-if="permissions.can('delete', schema.id)"
                class="danger"
                type="button"
                @click="removeObject(row.__object as EntityObject)"
              >
                Удалить
              </button>
            </div>
          </Teleport>
        </div>
        <span v-else>{{ row[column.field] }}</span>
      </template>
    </UiTable>
  </div>
</template>

<style scoped>
.registry {
  display: grid;
  gap: 14px;
}

.registry-toolbar {
  align-items: stretch;
}

.registry-toolbar :deep(.ui-toolbar__main) {
  flex: 1;
  min-width: 0;
}

.registry-toolbar :deep(.ui-toolbar__actions) {
  margin-left: auto;
}

.registry-toolbar__search {
  min-width: min(340px, 100%);
  flex: 1;
}

.registry-toolbar__search :deep(.p-inputtext) {
  width: 100%;
}

.registry-filters {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
}

.registry-filters__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.registry-filters__header h3 {
  margin: 0;
  font-size: 15px;
  line-height: 1.25;
}

.registry-filters__header p,
.registry-filters__empty {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.35;
}

.registry-filters__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.registry-filters__list {
  display: grid;
  gap: 10px;
}

.registry-filter-row {
  display: grid;
  grid-template-columns: minmax(180px, 1.1fr) minmax(160px, 0.8fr) minmax(180px, 1fr) auto;
  gap: 10px;
  align-items: end;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.registry-filter-row__spacer {
  min-height: 38px;
}

.registry-filter__input {
  width: 100%;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.registry-filter__input:focus {
  border-color: #93c5fd;
  outline: none;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.registry-actions {
  display: flex;
  justify-content: flex-end;
}

.registry-actions__trigger {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.registry-actions__trigger:hover,
.registry-actions__trigger:focus-visible {
  border-color: #bfdbfe;
  color: var(--color-text);
  outline: none;
}

.registry-actions__menu {
  position: fixed;
  z-index: 1100;
  min-width: 150px;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.16);
}

.registry-actions__menu button {
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.registry-actions__menu button:hover,
.registry-actions__menu button:focus-visible {
  background: var(--color-accent-soft);
  outline: none;
}

.registry-actions__menu button.danger {
  color: #dc2626;
}

@media (max-width: 980px) {
  .registry-toolbar :deep(.ui-toolbar__actions) {
    width: 100%;
    margin-left: 0;
  }

  .registry-filter-row {
    grid-template-columns: 1fr;
  }
}
</style>
