<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Message from 'primevue/message'
import UiButton from '../../shared/ui/UiButton.vue'
import UiTabs from '../../shared/ui/UiTabs.vue'
import EntityFieldRenderer from './EntityFieldRenderer.vue'
import GeometryEditor from '../map/GeometryEditor.vue'
import type { DomainGeometry, EntityObject, EntityObjectValues, EntitySchema, ObjectValue } from '../../shared/types/domain'
import type { EntityFormPayload } from './types'

const props = withDefaults(
  defineProps<{
    schema: EntitySchema
    object?: EntityObject
    saving?: boolean
    submitLabel?: string
    conflictGeometries?: DomainGeometry[]
  }>(),
  {
    saving: false,
    submitLabel: 'Сохранить',
    conflictGeometries: () => [],
  },
)

const emit = defineEmits<{
  submit: [payload: EntityFormPayload]
  validate: [payload: EntityFormPayload]
}>()

const activeTab = ref('main')
const values = reactive<EntityObjectValues>({})
const geometry = ref<DomainGeometry | undefined>()
const errors = ref<Record<string, string>>({})

const tabs = computed(() => [
  { label: 'Основное', value: 'main' },
  ...(props.schema.geometryType !== 'none' ? [{ label: 'Карта', value: 'map' }] : []),
  { label: 'Документы', value: 'documents' },
])

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
        :conflict-geometries="conflictGeometries"
        :fallback-address="addressValue"
        height="420px"
      />
    </section>

    <section v-else class="panel">
      <p class="muted">Документы можно добавить после сохранения объекта.</p>
    </section>

    <div class="entity-form__actions">
      <slot name="secondary" />
      <UiButton :label="submitLabel" type="submit" icon="pi pi-save" :loading="saving" />
    </div>
  </form>
</template>

<style scoped>
.entity-form {
  display: grid;
  gap: 16px;
}

.entity-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
