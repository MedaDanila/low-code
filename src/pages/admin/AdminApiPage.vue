<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import InputNumber from 'primevue/inputnumber'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import UiTabs from '../../shared/ui/UiTabs.vue'
import { usePlatformStore } from '../../stores/platform'
import {
  createGeneratedApiBody,
  createGeneratedApiCatalog,
  createGeneratedApiQuery,
  createGeneratedApiRequest,
  createGeneratedOpenApi,
  executeGeneratedApiRequest,
  generatedApiOperators,
  operatorNeedsValue,
  type GeneratedApiFilter,
  type GeneratedApiOperator,
  type GeneratedApiRequest,
  type GeneratedApiResource,
  type GeneratedApiTransport,
} from '../../shared/lib/generatedApi'
import { createId } from '../../shared/lib/id'

type SelectValue = string | number | boolean | null

const platform = usePlatformStore()
const toast = useToast()

const selectedResourceId = ref('')
const request = ref<GeneratedApiRequest | null>(null)

const resources = computed(() =>
  createGeneratedApiCatalog({
    schemas: platform.entitySchemas,
    objects: platform.entityObjects,
    dictionaries: platform.dictionaries,
  }),
)
const entityResources = computed(() => resources.value.filter((resource) => resource.kind === 'entity'))
const dictionaryResources = computed(() => resources.value.filter((resource) => resource.kind === 'dictionary'))
const selectedResource = computed(() => resources.value.find((resource) => resource.id === selectedResourceId.value))
const transportTabs = [
  { label: 'Query', value: 'query' },
  { label: 'Тело запроса', value: 'body' },
]
const logicOptions = [
  { label: 'Все условия', value: 'and' },
  { label: 'Любое условие', value: 'or' },
]
const operatorOptions = generatedApiOperators.map((operator) => ({ label: operator.label, value: operator.value }))
const fieldOptions = computed(() =>
  selectedResource.value?.fields
    .filter((field) => field.filterable)
    .map((field) => ({ label: field.label, value: field.key })) ?? [],
)
const sortOptions = computed(() => [
  { label: 'Без сортировки', value: '' },
  ...(selectedResource.value?.fields
    .filter((field) => field.sortable)
    .flatMap((field) => [
      { label: `${field.label} по возрастанию`, value: field.key },
      { label: `${field.label} по убыванию`, value: `-${field.key}` },
    ]) ?? []),
])
const queryPreview = computed(() =>
  selectedResource.value && request.value ? createGeneratedApiQuery(selectedResource.value, request.value) : '',
)
const bodyPreview = computed(() =>
  selectedResource.value && request.value
    ? JSON.stringify(createGeneratedApiBody(selectedResource.value, request.value), null, 2)
    : '',
)
const apiResponse = computed(() =>
  selectedResource.value && request.value
    ? executeGeneratedApiRequest(selectedResource.value, request.value, {
        schemas: platform.entitySchemas,
        objects: platform.entityObjects,
        dictionaries: platform.dictionaries,
      })
    : null,
)
const resultColumns = computed(() => {
  const sample = apiResponse.value?.data[0]
  if (!sample) return []
  return Object.keys(sample).slice(0, 8).map((field) => ({ field, header: field, sortable: false }))
})
const resultRows = computed<Record<string, unknown>[]>(() => apiResponse.value?.data as Record<string, unknown>[] ?? [])

watch(
  resources,
  (items) => {
    if (!items.length) {
      selectedResourceId.value = ''
      request.value = null
      return
    }
    if (!items.some((item) => item.id === selectedResourceId.value)) {
      selectResource(items[0])
    }
  },
  { immediate: true },
)

function selectResource(resource: GeneratedApiResource): void {
  selectedResourceId.value = resource.id
  request.value = createGeneratedApiRequest(resource)
}

function addFilter(): void {
  if (!request.value) return
  request.value.filters.push({
    id: createId('api_filter'),
    field: fieldOptions.value[0]?.value ? String(fieldOptions.value[0].value) : '',
    operator: 'equals',
    value: '',
  })
}

function deleteFilter(id: string): void {
  if (!request.value) return
  request.value.filters = request.value.filters.filter((filter) => filter.id !== id)
}

function updateFilterField(filter: GeneratedApiFilter, value: SelectValue): void {
  filter.field = value ? String(value) : ''
}

function updateFilterOperator(filter: GeneratedApiFilter, value: SelectValue): void {
  filter.operator = (value || 'equals') as GeneratedApiOperator
  if (!operatorNeedsValue(filter.operator)) filter.value = ''
}

function updateTransport(value: string): void {
  if (!request.value) return
  request.value.transport = value as GeneratedApiTransport
}

async function copyOpenApi(): Promise<void> {
  await copyText(JSON.stringify(createGeneratedOpenApi(resources.value), null, 2), 'OpenAPI скопирован')
}

async function copyCurrentRequest(): Promise<void> {
  if (!request.value) return
  const text = request.value.transport === 'query' ? queryPreview.value : bodyPreview.value
  await copyText(text, 'Запрос скопирован')
}

async function copyText(text: string, summary: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ severity: 'success', summary, life: 2200 })
  } catch {
    toast.add({ severity: 'warn', summary: 'Не удалось скопировать', detail: 'Скопируйте текст вручную из блока запроса.', life: 3200 })
  }
}
</script>

<template>
  <div>
    <UiPageHeader
      title="API"
      description="Автоматически созданные ручки для опубликованных сущностей и справочников с фильтрацией через query или JSON-тело."
    >
      <template #actions>
        <UiButton label="Скопировать OpenAPI" icon="pi pi-copy" severity="secondary" variant="outlined" @click="copyOpenApi" />
      </template>
    </UiPageHeader>

    <UiEmptyState
      v-if="resources.length === 0"
      title="Нет данных для генерации API"
      description="Опубликуйте хотя бы одну сущность и добавьте справочники, чтобы появились ручки."
    />

    <div v-else class="api-layout">
      <aside class="panel api-catalog">
        <div class="api-catalog__title">
          <strong>Данные системы</strong>
          <span>{{ resources.length }}</span>
        </div>

        <section v-if="entityResources.length" class="api-catalog__group">
          <p>Сущности</p>
          <button
            v-for="resource in entityResources"
            :key="resource.id"
            type="button"
            class="api-resource-button"
            :class="{ active: selectedResourceId === resource.id }"
            @click="selectResource(resource)"
          >
            <span>{{ resource.name }}</span>
            <small>{{ resource.count }} записей</small>
          </button>
        </section>

        <section v-if="dictionaryResources.length" class="api-catalog__group">
          <p>Справочники</p>
          <button
            v-for="resource in dictionaryResources"
            :key="resource.id"
            type="button"
            class="api-resource-button"
            :class="{ active: selectedResourceId === resource.id }"
            @click="selectResource(resource)"
          >
            <span>{{ resource.name }}</span>
            <small>{{ resource.count }} значений</small>
          </button>
        </section>
      </aside>

      <main v-if="selectedResource && request" class="stack">
        <section class="panel stack">
          <div class="api-resource-head">
            <div>
              <p class="eyebrow">{{ selectedResource.kind === 'entity' ? 'Сущность' : 'Справочник' }}</p>
              <h3>{{ selectedResource.name }}</h3>
              <p>{{ selectedResource.description }}</p>
            </div>
            <div class="api-resource-count">
              <span>Доступно</span>
              <strong>{{ selectedResource.count }}</strong>
            </div>
          </div>

          <div class="api-endpoints">
            <div v-for="endpoint in selectedResource.endpoints" :key="endpoint.id" class="api-endpoint-row">
              <span class="api-method" :class="`api-method--${endpoint.method.toLowerCase()}`">{{ endpoint.method }}</span>
              <code>{{ endpoint.path }}</code>
              <span>{{ endpoint.description }}</span>
            </div>
          </div>
        </section>

        <section class="panel stack">
          <div class="api-section-header">
            <div>
              <h3>Фильтрация</h3>
              <p>Выберите поля русскими названиями, а генератор подготовит query-строку или тело запроса.</p>
            </div>
            <UiTabs :model-value="request.transport" :tabs="transportTabs" @update:model-value="updateTransport" />
          </div>

          <div class="form-grid api-controls">
            <div class="form-field">
              <label>Логика условий</label>
              <UiSelect v-model="request.logic" :options="logicOptions" />
            </div>
            <div class="form-field">
              <label>Сортировка</label>
              <UiSelect v-model="request.sort" :options="sortOptions" />
            </div>
            <div class="form-field">
              <label>Лимит</label>
              <InputNumber v-model="request.limit" :min="1" :max="1000" fluid />
            </div>
            <div class="form-field">
              <label>Смещение</label>
              <InputNumber v-model="request.offset" :min="0" fluid />
            </div>
          </div>

          <div class="api-filters">
            <div v-for="filter in request.filters" :key="filter.id" class="api-filter-row">
              <UiSelect
                :model-value="filter.field"
                :options="fieldOptions"
                placeholder="Поле"
                @update:model-value="updateFilterField(filter, $event)"
              />
              <UiSelect
                :model-value="filter.operator"
                :options="operatorOptions"
                placeholder="Оператор"
                @update:model-value="updateFilterOperator(filter, $event)"
              />
              <UiInput
                v-if="operatorNeedsValue(filter.operator)"
                v-model="filter.value"
                placeholder="Значение или список через запятую"
              />
              <span v-else class="api-filter-empty">Значение не требуется</span>
              <UiButton label="Удалить" severity="danger" variant="outlined" @click="deleteFilter(filter.id)" />
            </div>
          </div>

          <div class="inline-actions">
            <UiButton label="Добавить условие" icon="pi pi-plus" severity="secondary" variant="outlined" @click="addFilter" />
            <UiButton label="Скопировать запрос" icon="pi pi-copy" severity="secondary" variant="outlined" @click="copyCurrentRequest" />
          </div>

          <div class="api-preview">
            <div class="api-preview__title">
              <span>{{ request.transport === 'query' ? 'Query-запрос' : 'Тело запроса' }}</span>
              <strong>{{ request.transport === 'query' ? 'GET' : 'POST' }}</strong>
            </div>
            <pre v-if="request.transport === 'body'">{{ bodyPreview }}</pre>
            <code v-else>{{ queryPreview }}</code>
          </div>
        </section>

        <section class="panel stack">
          <div class="api-section-header">
            <div>
              <h3>Проверка результата</h3>
              <p>{{ apiResponse?.returned ?? 0 }} из {{ apiResponse?.total ?? 0 }} записей после фильтрации.</p>
            </div>
          </div>

          <UiTable
            v-if="resultRows.length && resultColumns.length"
            :rows="resultRows"
            :columns="resultColumns"
            :rows-per-page="5"
            empty-message="Нет данных"
          />
          <UiEmptyState
            v-else
            title="По текущим условиям ничего не найдено"
            description="Измените фильтры или выберите другой источник данных."
          />
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.api-layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 18px;
}

.api-catalog {
  position: sticky;
  top: 96px;
  align-self: start;
  display: grid;
  gap: 18px;
}

.api-catalog__title,
.api-resource-head,
.api-section-header,
.api-preview__title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.api-catalog__title span,
.api-resource-count {
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.api-catalog__title span {
  padding: 3px 8px;
}

.api-catalog__group {
  display: grid;
  gap: 6px;
}

.api-catalog__group p,
.api-resource-head p,
.api-section-header p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.api-resource-button {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.api-resource-button:hover,
.api-resource-button.active {
  border-color: #bfdbfe;
  background: var(--color-accent-soft);
}

.api-resource-button span {
  font-weight: 700;
}

.api-resource-button small {
  color: var(--color-text-secondary);
}

.api-resource-head h3,
.api-section-header h3 {
  margin: 0 0 6px;
  font-size: 18px;
  letter-spacing: 0;
}

.api-resource-count {
  min-width: 112px;
  padding: 10px 12px;
}

.api-resource-count span {
  display: block;
  margin-bottom: 4px;
}

.api-resource-count strong {
  display: block;
  color: var(--color-text);
  font-size: 24px;
  line-height: 1;
}

.api-endpoints {
  display: grid;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.api-endpoint-row {
  display: grid;
  grid-template-columns: 80px minmax(260px, 0.8fr) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
}

.api-endpoint-row:last-child {
  border-bottom: 0;
}

.api-endpoint-row code {
  color: var(--color-text);
  font-size: 12px;
  word-break: break-all;
}

.api-endpoint-row span:last-child {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.api-method {
  justify-self: start;
  min-width: 56px;
  padding: 4px 7px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
  text-align: center;
}

.api-method--get {
  background: var(--color-info-soft);
  color: var(--color-info);
}

.api-method--post {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.api-method--patch {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.api-method--delete {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.api-controls {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.6fr) 140px 140px;
}

.api-filters {
  display: grid;
  gap: 8px;
}

.api-filter-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) minmax(220px, 1.3fr) auto;
  gap: 8px;
  align-items: center;
}

.api-filter-empty {
  min-height: 38px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  background: var(--color-surface-muted);
}

.api-preview {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: #101828;
  color: #f9fafb;
}

.api-preview__title span {
  color: #d1d5db;
  font-weight: 700;
}

.api-preview__title strong {
  color: #93c5fd;
  font-size: 12px;
}

.api-preview code,
.api-preview pre {
  margin: 0;
  color: #f9fafb;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 1180px) {
  .api-layout,
  .api-controls,
  .api-filter-row,
  .api-endpoint-row {
    grid-template-columns: 1fr;
  }

  .api-catalog {
    position: static;
  }
}
</style>
