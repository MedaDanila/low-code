<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Checkbox from 'primevue/checkbox'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTextarea from '../../shared/ui/UiTextarea.vue'
import { usePlatformStore } from '../../stores/platform'
import EntityForm from '../../widgets/entity/EntityForm.vue'
import EntityPropertyList from '../../widgets/entity/EntityPropertyList.vue'
import EntityRegistry from '../../widgets/entity/EntityRegistry.vue'
import type {
  EntityField,
  EntityMapColorRule,
  EntityMapRuleOperator,
  EntityMapStyle,
  EntityObject,
  EntitySchema,
  FieldType,
  MapGeometryType,
} from '../../shared/types/domain'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const platform = usePlatformStore()
const editable = ref<EntitySchema | null>(null)
const selectedFieldId = ref('')
const previewMode = ref(false)
const draggedFieldId = ref('')

const fieldTypes: { label: string; value: FieldType }[] = [
  { label: 'Строка', value: 'string' },
  { label: 'Текст', value: 'text' },
  { label: 'Целое число', value: 'integer' },
  { label: 'Дробное число', value: 'decimal' },
  { label: 'Да/нет', value: 'boolean' },
  { label: 'Дата', value: 'date' },
  { label: 'Дата и время', value: 'datetime' },
  { label: 'Адрес', value: 'address' },
  { label: 'Справочник', value: 'enum' },
  { label: 'Ссылка на сущность', value: 'reference' },
  { label: 'Файл', value: 'file' },
]

const mapGeometryOptions: Array<{ label: string; value: MapGeometryType }> = [
  { label: 'Точка', value: 'point' },
  { label: 'Линия', value: 'lineString' },
  { label: 'Полигон', value: 'polygon' },
]

const colorRuleOperators: Array<{ label: string; value: EntityMapRuleOperator }> = [
  { label: 'Равно', value: 'equals' },
  { label: 'Не равно', value: 'notEquals' },
  { label: 'Содержит', value: 'contains' },
  { label: 'Заполнено', value: 'filled' },
  { label: 'Пусто', value: 'empty' },
  { label: 'Меньше / раньше', value: 'before' },
  { label: 'Больше / позже', value: 'after' },
]

const defaultGeometryStyles: Record<MapGeometryType, EntityMapStyle> = {
  point: {
    fill: '#f97316',
    stroke: '#c2410c',
    strokeWidth: 2,
    pointSize: 8,
    opacity: 0.82,
  },
  lineString: {
    fill: '#38bdf8',
    stroke: '#0284c7',
    strokeWidth: 3,
    pointSize: 8,
    opacity: 0.9,
  },
  polygon: {
    fill: '#2563eb',
    stroke: '#1d4ed8',
    strokeWidth: 2,
    pointSize: 8,
    opacity: 0.74,
  },
}

watch(
  () => [route.params.id, platform.entitySchemas],
  () => {
    const source = platform.schemaById(String(route.params.id))
    editable.value = source ? withBuilderDefaults(JSON.parse(JSON.stringify(source)) as EntitySchema) : null
    selectedFieldId.value = editable.value?.fields[0]?.id ?? ''
  },
  { immediate: true, deep: true },
)

const selectedField = computed(() => editable.value?.fields.find((field) => field.id === selectedFieldId.value))
const orderedFields = computed(() => [...(editable.value?.fields ?? [])].sort((a, b) => a.order - b.order))
const entityDictionaryOptions = computed(() =>
  platform.dictionaries
    .filter((dictionary) => dictionary.entityId === editable.value?.id)
    .map((dictionary) => ({ label: dictionary.name, value: dictionary.id })),
)
const mapRuleFieldOptions = computed(() => [
  { label: 'Статус', value: '__status' },
  ...orderedFields.value.map((field) => ({ label: field.name, value: field.code })),
])
const previewObject = computed<EntityObject | null>(() => {
  if (!editable.value) return null
  return {
    id: 'preview-object',
    entityId: editable.value.id,
    values: Object.fromEntries(editable.value.fields.map((field) => [field.code, sampleValue(field)])),
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'usr_admin',
    updatedBy: 'usr_admin',
  }
})

function withBuilderDefaults(schema: EntitySchema): EntitySchema {
  return {
    ...schema,
    mapSettings: schema.mapSettings ?? {
      enabledGeometryTypes: schema.geometryType === 'none' ? ['point'] : [schema.geometryType],
      clusteringEnabled: false,
      styles: structuredClone(defaultGeometryStyles),
      colorRules: [],
    },
  }
}

function addField() {
  if (!editable.value) return
  const field = platform.createEmptyField(editable.value.fields.length + 1)
  editable.value.fields.push(field)
  selectedFieldId.value = field.id
}

function deleteField(fieldId: string) {
  if (!editable.value) return
  editable.value.fields = editable.value.fields.filter((field) => field.id !== fieldId)
  normalizeOrder()
  selectedFieldId.value = editable.value.fields[0]?.id ?? ''
}

function moveField(targetFieldId: string) {
  if (!editable.value || !draggedFieldId.value || draggedFieldId.value === targetFieldId) return
  const fields = orderedFields.value
  const dragged = fields.find((field) => field.id === draggedFieldId.value)
  const targetIndex = fields.findIndex((field) => field.id === targetFieldId)
  if (!dragged || targetIndex < 0) return
  const withoutDragged = fields.filter((field) => field.id !== dragged.id)
  withoutDragged.splice(targetIndex, 0, dragged)
  editable.value.fields = withoutDragged.map((field, index) => ({ ...field, order: index + 1 }))
}

function normalizeOrder() {
  if (!editable.value) return
  editable.value.fields = orderedFields.value.map((field, index) => ({ ...field, order: index + 1 }))
}

async function save() {
  if (!editable.value) return
  normalizeBeforeSave()
  await platform.saveSchema(editable.value)
  toast.add({ severity: 'success', summary: 'Схема сохранена', detail: editable.value.name, life: 2400 })
}

async function publish() {
  if (!editable.value) return
  await save()
  await platform.publishSchema(editable.value.id)
  toast.add({ severity: 'success', summary: 'Сущность опубликована', detail: 'Навигация приложения обновлена', life: 2800 })
  router.push(`/app/entities/${editable.value.code}`)
}

function updateField<K extends keyof EntityField>(key: K, value: EntityField[K]) {
  if (!selectedField.value) return
  selectedField.value[key] = value
}

function togglePreviewMode() {
  previewMode.value = !previewMode.value
}

function normalizeBeforeSave() {
  if (!editable.value) return
  editable.value.fields = orderedFields.value.map((field, index) => ({
    ...field,
    searchable: true,
    filterable: true,
    order: index + 1,
  }))
  editable.value.geometryType = editable.value.mapSettings.enabledGeometryTypes[0] ?? 'none'
}

function hasGeometryType(type: MapGeometryType): boolean {
  return Boolean(editable.value?.mapSettings.enabledGeometryTypes.includes(type))
}

function toggleGeometryType(type: MapGeometryType, checked: boolean) {
  if (!editable.value) return
  const current = new Set(editable.value.mapSettings.enabledGeometryTypes)
  if (checked) current.add(type)
  else current.delete(type)
  if (checked && !editable.value.mapSettings.styles[type]) {
    editable.value.mapSettings.styles[type] = { ...defaultGeometryStyles[type] }
  }
  editable.value.mapSettings.enabledGeometryTypes = Array.from(current)
  editable.value.geometryType = editable.value.mapSettings.enabledGeometryTypes[0] ?? 'none'
}

function mapGeometryLabel(type: MapGeometryType): string {
  return mapGeometryOptions.find((option) => option.value === type)?.label ?? type
}

function fieldTypeLabel(type: FieldType): string {
  return fieldTypes.find((option) => option.value === type)?.label ?? type
}

function addColorRule() {
  if (!editable.value) return
  const firstFieldCode = mapRuleFieldOptions.value[0]?.value ?? '__status'
  editable.value.mapSettings.colorRules.push({
    id: `maprule_${Date.now()}`,
    name: 'Новое условие',
    fieldCode: firstFieldCode,
    operator: 'equals',
    value: '',
    color: '#ef4444',
  })
}

function deleteColorRule(ruleId: string) {
  if (!editable.value) return
  editable.value.mapSettings.colorRules = editable.value.mapSettings.colorRules.filter((rule) => rule.id !== ruleId)
}

function updateColorRule<K extends keyof EntityMapColorRule>(rule: EntityMapColorRule, key: K, value: EntityMapColorRule[K]) {
  rule[key] = value
}

function colorRuleNeedsValue(operator: EntityMapRuleOperator): boolean {
  return !['filled', 'empty'].includes(operator)
}

function sampleValue(field: EntityField) {
  if (field.type === 'boolean') return true
  if (field.type === 'integer') return 42
  if (field.type === 'decimal') return 42.5
  if (field.type === 'date') return '2026-08-11'
  if (field.type === 'address') return 'г Нижний Новгород, ул Большая Покровская, д 1'
  if (field.type === 'enum') return platform.dictionaryById(field.enumId)?.items[0]?.code ?? 'значение'
  if (field.type === 'file') return ['пример.pdf']
  return field.name
}
</script>

<template>
  <div>
    <UiEmptyState v-if="!editable" title="Сущность не найдена" />
    <template v-else>
      <UiPageHeader :title="`Сущность: ${editable.name}`" :description="editable.description">
        <template #actions>
          <UiButton
            :label="previewMode ? 'Редактировать' : 'Предпросмотр'"
            :icon="previewMode ? 'pi pi-pencil' : 'pi pi-eye'"
            severity="secondary"
            variant="outlined"
            @click="togglePreviewMode"
          />
          <UiButton label="Сохранить" icon="pi pi-save" severity="secondary" variant="outlined" @click="save" />
          <UiButton label="Опубликовать" icon="pi pi-send" @click="publish" />
        </template>
      </UiPageHeader>

      <div class="builder-shell">
        <template v-if="!previewMode">
          <section class="panel stack">
            <h3 class="surface-title">Настройки сущности</h3>
            <div class="form-grid">
              <div class="form-field">
                <label>Название</label>
                <UiInput v-model="editable.name" />
              </div>
              <div class="form-field full">
                <label>Описание</label>
                <UiTextarea v-model="editable.description" />
              </div>
            </div>
          </section>

          <section class="builder-grid">
            <aside class="panel stack">
              <div class="inline-actions" style="justify-content: space-between">
                <h3 class="surface-title">Поля</h3>
                <UiButton label="Добавить поле" icon="pi pi-plus" severity="secondary" variant="outlined" @click="addField" />
              </div>
              <button
                v-for="field in orderedFields"
                :key="field.id"
                type="button"
                class="field-row"
                :class="{ active: field.id === selectedFieldId }"
                draggable="true"
                @click="selectedFieldId = field.id"
                @dragstart="draggedFieldId = field.id"
                @dragover.prevent
                @drop.prevent="moveField(field.id)"
              >
                <span>≡</span>
                <strong>{{ field.name }}</strong>
                <small>{{ fieldTypeLabel(field.type) }}</small>
              </button>
            </aside>

            <section class="panel stack">
              <h3 class="surface-title">Настройки поля</h3>
              <template v-if="selectedField">
                <div class="form-grid">
                  <div class="form-field">
                    <label>Название</label>
                    <UiInput :model-value="selectedField.name" @update:model-value="updateField('name', String($event))" />
                  </div>
                  <div class="form-field">
                    <label>Тип</label>
                    <UiSelect
                      :model-value="selectedField.type"
                      :options="fieldTypes"
                      @update:model-value="updateField('type', $event as FieldType)"
                    />
                  </div>
                  <div v-if="selectedField.type === 'enum'" class="form-field">
                    <label>Справочник</label>
                    <UiSelect
                      :model-value="selectedField.enumId ?? null"
                      :options="entityDictionaryOptions"
                      @update:model-value="updateField('enumId', String($event))"
                    />
                  </div>
                </div>
                <div class="settings-grid">
                  <label><Checkbox :model-value="selectedField.required" binary @update:model-value="updateField('required', Boolean($event))" /> Обязательное</label>
                  <label><Checkbox :model-value="selectedField.listVisible" binary @update:model-value="updateField('listVisible', Boolean($event))" /> Показывать в списке</label>
                  <label><Checkbox :model-value="selectedField.cardVisible" binary @update:model-value="updateField('cardVisible', Boolean($event))" /> Показывать в карточке</label>
                </div>
                <UiButton label="Удалить поле" severity="danger" variant="outlined" @click="deleteField(selectedField.id)" />
              </template>
            </section>
          </section>

          <section class="panel stack map-settings-panel">
            <div class="inline-actions" style="justify-content: space-between">
              <h3 class="surface-title">Карта</h3>
              <label class="map-toggle">
                <Checkbox
                  :model-value="editable.mapSettings.clusteringEnabled"
                  binary
                  @update:model-value="editable.mapSettings.clusteringEnabled = Boolean($event)"
                />
                <span>Кластеризация</span>
              </label>
            </div>

            <div class="map-settings-grid">
              <div class="form-field full">
                <label>Допустимые геометрии</label>
                <div class="geometry-checkboxes">
                  <label v-for="option in mapGeometryOptions" :key="option.value">
                    <Checkbox
                      :model-value="hasGeometryType(option.value)"
                      binary
                      @update:model-value="toggleGeometryType(option.value, Boolean($event))"
                    />
                    <span>{{ option.label }}</span>
                  </label>
                </div>
              </div>
            </div>

            <div class="geometry-style-list">
              <article v-for="type in editable.mapSettings.enabledGeometryTypes" :key="type" class="geometry-style-card">
                <h4>{{ mapGeometryLabel(type) }}</h4>
                <div class="geometry-style-grid">
                  <div class="form-field">
                    <label>Заливка</label>
                    <input v-model="editable.mapSettings.styles[type].fill" class="color-input" type="color" />
                  </div>
                  <div class="form-field">
                    <label>Обводка</label>
                    <input v-model="editable.mapSettings.styles[type].stroke" class="color-input" type="color" />
                  </div>
                  <div class="form-field">
                    <label>Толщина линии</label>
                    <input v-model.number="editable.mapSettings.styles[type].strokeWidth" class="native-input" type="number" min="1" step="1" />
                  </div>
                  <div class="form-field">
                    <label>Размер точки</label>
                    <input v-model.number="editable.mapSettings.styles[type].pointSize" class="native-input" type="number" min="4" step="1" />
                  </div>
                  <div class="form-field">
                    <label>Прозрачность</label>
                    <input v-model.number="editable.mapSettings.styles[type].opacity" class="native-input" type="number" min="0.1" max="1" step="0.05" />
                  </div>
                </div>
              </article>
            </div>

            <div class="color-rules">
              <div class="inline-actions" style="justify-content: space-between">
                <h3 class="surface-title">Условия цвета</h3>
                <UiButton label="Добавить условие" icon="pi pi-plus" severity="secondary" variant="outlined" @click="addColorRule" />
              </div>

              <div v-if="editable.mapSettings.colorRules.length === 0" class="muted">Цвет меняется только по базовому стилю.</div>

              <article v-for="rule in editable.mapSettings.colorRules" :key="rule.id" class="color-rule-row">
                <div class="form-field">
                  <label>Название</label>
                  <UiInput :model-value="rule.name" @update:model-value="updateColorRule(rule, 'name', String($event))" />
                </div>
                <div class="form-field">
                  <label>Поле</label>
                  <UiSelect
                    :model-value="rule.fieldCode"
                    :options="mapRuleFieldOptions"
                    @update:model-value="updateColorRule(rule, 'fieldCode', String($event))"
                  />
                </div>
                <div class="form-field">
                  <label>Условие</label>
                  <UiSelect
                    :model-value="rule.operator"
                    :options="colorRuleOperators"
                    @update:model-value="updateColorRule(rule, 'operator', $event as EntityMapRuleOperator)"
                  />
                </div>
                <div v-if="colorRuleNeedsValue(rule.operator)" class="form-field">
                  <label>Значение</label>
                  <UiInput :model-value="rule.value" @update:model-value="updateColorRule(rule, 'value', String($event))" />
                </div>
                <div class="form-field">
                  <label>Цвет</label>
                  <input v-model="rule.color" class="color-input" type="color" />
                </div>
                <UiButton label="Удалить" severity="danger" variant="outlined" @click="deleteColorRule(rule.id)" />
              </article>
            </div>
          </section>
        </template>

        <section v-else class="preview-grid">
          <div class="panel stack">
            <h3 class="surface-title">Реестр</h3>
            <EntityRegistry v-if="previewObject" :schema="editable" :objects="[previewObject]" />
          </div>
          <div class="panel stack">
            <h3 class="surface-title">Форма</h3>
            <EntityForm :schema="editable" submit-label="Сохранить предпросмотр" />
          </div>
          <div class="panel stack">
            <h3 class="surface-title">Карточка</h3>
            <EntityPropertyList v-if="previewObject" :schema="editable" :object="previewObject" />
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.builder-shell {
  display: grid;
  gap: 14px;
}

.builder-grid {
  display: grid;
  grid-template-columns: 330px minmax(0, 1fr);
  gap: 18px;
}

.field-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 42px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  text-align: left;
  cursor: grab;
}

.field-row.active {
  border-color: #bfdbfe;
  background: var(--color-accent-soft);
}

.field-row small {
  color: var(--color-text-secondary);
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.settings-grid label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.map-settings-panel {
  gap: 16px;
}

.map-settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.geometry-style-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.geometry-style-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.geometry-style-card h4 {
  margin: 0;
  font-size: 13px;
}

.geometry-style-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.geometry-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.geometry-checkboxes label,
.map-toggle {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
}

.native-input,
.color-input {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.native-input {
  padding: 0 10px;
}

.color-input {
  padding: 4px 6px;
}

.color-rules {
  display: grid;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
}

.color-rule-row {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) minmax(130px, 1fr) minmax(130px, 1fr) minmax(130px, 1fr) 80px auto;
  gap: 10px;
  align-items: end;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.preview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.9fr);
  gap: 18px;
  align-items: start;
}

.preview-grid > .panel:first-child {
  grid-column: 1 / -1;
}

@media (max-width: 1180px) {
  .builder-grid,
  .preview-grid {
    grid-template-columns: 1fr;
  }

  .map-settings-grid,
  .geometry-style-list,
  .color-rule-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .geometry-style-grid {
    grid-template-columns: 1fr;
  }
}
</style>
