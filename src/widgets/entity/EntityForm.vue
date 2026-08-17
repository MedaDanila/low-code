<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Message from 'primevue/message'
import UiButton from '../../shared/ui/UiButton.vue'
import UiTabs from '../../shared/ui/UiTabs.vue'
import EntityFieldRenderer from './EntityFieldRenderer.vue'
import GeometryEditor from '../map/GeometryEditor.vue'
import type { DomainGeometry, EntityObject, EntityObjectValues, EntitySchema, MapGeometryType, ObjectValue } from '../../shared/types/domain'
import type { EntityFormPayload } from './types'

type EntityFormTab = 'main' | 'map' | 'documents'

const props = withDefaults(
  defineProps<{
    schema: EntitySchema
    object?: EntityObject
    saving?: boolean
    submitLabel?: string
    cancelLabel?: string
    initialTab?: EntityFormTab
    conflictGeometries?: DomainGeometry[]
  }>(),
  {
    saving: false,
    submitLabel: 'Сохранить',
    cancelLabel: '',
    initialTab: 'main',
    conflictGeometries: () => [],
  },
)

const emit = defineEmits<{
  submit: [payload: EntityFormPayload]
  validate: [payload: EntityFormPayload]
  cancel: []
  'tab-change': [tab: EntityFormTab]
}>()

const activeTab = ref<EntityFormTab>('main')
const values = reactive<EntityObjectValues>({})
const geometry = ref<DomainGeometry | undefined>()
const errors = ref<Record<string, string>>({})

const enabledGeometryTypes = computed<MapGeometryType[]>(() =>
  props.schema.mapSettings.enabledGeometryTypes.length > 0
    ? props.schema.mapSettings.enabledGeometryTypes
    : props.schema.geometryType !== 'none'
      ? [props.schema.geometryType]
      : [],
)
const hasMap = computed(() => enabledGeometryTypes.value.length > 0)
const tabs = computed(() => [
  { label: 'Основное', value: 'main' },
  ...(hasMap.value ? [{ label: 'Карта', value: 'map' }] : []),
  { label: 'Документы', value: 'documents' },
])
const activeTabTitle = computed(() => {
  if (activeTab.value === 'map') return 'Редактирование карты'
  if (activeTab.value === 'documents') return 'Документы'
  return 'Редактирование полей'
})
const activeTabDescription = computed(() => {
  if (activeTab.value === 'map') return 'Геометрия объекта, определение по адресу и ручная корректировка контура.'
  if (activeTab.value === 'documents') return 'Документы объекта будут доступны после сохранения.'
  return 'Поля карточки объекта строятся по настройкам сущности.'
})
const mapEditorHeight = computed(() => activeTab.value === 'map' ? 'calc(100vh - 260px)' : '420px')

const orderedFields = computed(() => [...props.schema.fields].sort((a, b) => a.order - b.order))
const addressValue = computed(() => {
  const addressField = orderedFields.value.find((field) => field.type === 'address')
  const value = addressField ? values[addressField.code] : ''
  return typeof value === 'string' ? value : ''
})

watch(
  () => [props.schema.id, props.object?.id],
  hydrateForm,
  { immediate: true },
)
watch(
  () => props.initialTab,
  (tab) => {
    activeTab.value = tab === 'map' && !hasMap.value ? 'main' : tab
  },
  { immediate: true },
)
watch(activeTab, (tab) => emit('tab-change', tab), { immediate: true })

function hydrateForm() {
  Object.keys(values).forEach((key) => delete values[key])
  orderedFields.value.forEach((field) => {
    values[field.code] = props.object?.values[field.code] ?? defaultValue(field.type)
  })
  geometry.value = props.object?.geometry
  errors.value = {}
}

function validateAndSubmit() {
  const nextErrors: Record<string, string> = {}
  orderedFields.value.forEach((field) => {
    const value = values[field.code]
    const empty = value === null || value === '' || (Array.isArray(value) && value.length === 0)
    if (field.required && empty) nextErrors[field.code] = 'Обязательное поле'
  })
  errors.value = nextErrors
  if (Object.keys(nextErrors).length > 0) {
    activeTab.value = 'main'
    return
  }
  emit('submit', { values: { ...values }, geometry: geometry.value })
}

function defaultValue(type: EntitySchema['fields'][number]['type']): ObjectValue {
  if (type === 'boolean') return false
  if (type === 'integer' || type === 'decimal') return null
  if (type === 'file') return []
  return ''
}
</script>

<template>
  <form class="entity-form" @submit.prevent="validateAndSubmit">
    <div class="entity-form__topbar">
      <div>
        <strong>{{ activeTabTitle }}</strong>
        <span>{{ activeTabDescription }}</span>
      </div>
      <div class="entity-form__actions">
        <UiButton
          v-if="cancelLabel"
          :label="cancelLabel"
          severity="secondary"
          variant="outlined"
          type="button"
          icon="pi pi-times"
          @click="emit('cancel')"
        />
        <UiButton :label="submitLabel" type="submit" icon="pi pi-save" :loading="saving" />
      </div>
    </div>

    <UiTabs v-model="activeTab" :tabs="tabs" />

    <section v-if="activeTab === 'main'" class="form-grid">
      <div
        v-for="field in orderedFields"
        :key="field.id"
        class="form-field"
        :class="{ full: field.type === 'text' || field.type === 'file' }"
      >
        <label :for="field.id">
          {{ field.name }}
          <span v-if="field.required" class="required-mark">*</span>
        </label>
        <EntityFieldRenderer
          :field="field"
          :model-value="values[field.code]"
          :invalid="Boolean(errors[field.code])"
          @update:model-value="values[field.code] = $event"
        />
        <Message v-if="errors[field.code]" severity="error" size="small" variant="simple">
          {{ errors[field.code] }}
        </Message>
      </div>
    </section>

    <section v-else-if="activeTab === 'map'" class="stack">
      <GeometryEditor
        v-model="geometry"
        :geometry-type="schema.geometryType"
        :enabled-geometry-types="enabledGeometryTypes"
        :conflict-geometries="conflictGeometries"
        :fallback-address="addressValue"
        :height="mapEditorHeight"
      />
    </section>

    <section v-else class="panel">
      <p class="muted">Документы можно добавить после сохранения объекта.</p>
    </section>
    <slot name="secondary" />
  </form>
</template>

<style scoped>
.entity-form {
  display: grid;
  gap: 16px;
}

.entity-form__topbar {
  position: sticky;
  top: 88px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(14px);
}

.entity-form__topbar > div:first-child {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.entity-form__topbar strong {
  font-size: 14px;
}

.entity-form__topbar span {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.3;
}

.entity-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
