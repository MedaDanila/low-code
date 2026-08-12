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
import UiTabs from '../../shared/ui/UiTabs.vue'
import UiTextarea from '../../shared/ui/UiTextarea.vue'
import { usePlatformStore } from '../../stores/platform'
import EntityForm from '../../widgets/entity/EntityForm.vue'
import EntityPropertyList from '../../widgets/entity/EntityPropertyList.vue'
import EntityRegistry from '../../widgets/entity/EntityRegistry.vue'
import type { EntityField, EntityObject, EntitySchema, FieldType, GeometryType } from '../../shared/types/domain'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const platform = usePlatformStore()
const editable = ref<EntitySchema | null>(null)
const selectedFieldId = ref('')
const activeTab = ref('builder')
const previewTab = ref('registry')
const draggedFieldId = ref('')

const fieldTypes: { label: string; value: FieldType }[] = [
  { label: 'String', value: 'string' },
  { label: 'Text', value: 'text' },
  { label: 'Integer', value: 'integer' },
  { label: 'Decimal', value: 'decimal' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Date', value: 'date' },
  { label: 'DateTime', value: 'datetime' },
  { label: 'Enum', value: 'enum' },
  { label: 'Reference', value: 'reference' },
  { label: 'File', value: 'file' },
]

const geometryTypes = [
  { label: 'None', value: 'none' },
  { label: 'Point', value: 'point' },
  { label: 'LineString', value: 'lineString' },
  { label: 'Polygon', value: 'polygon' },
]

watch(
  () => [route.params.id, platform.entitySchemas],
  () => {
    const source = platform.schemaById(String(route.params.id))
    editable.value = source ? JSON.parse(JSON.stringify(source)) as EntitySchema : null
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
  await platform.saveSchema(editable.value)
  toast.add({ severity: 'success', summary: 'Схема сохранена', detail: editable.value.name, life: 2400 })
}

async function publish() {
  if (!editable.value) return
  await save()
  await platform.publishSchema(editable.value.id)
  toast.add({ severity: 'success', summary: 'Сущность опубликована', detail: 'Runtime навигация обновлена', life: 2800 })
  router.push(`/app/entities/${editable.value.code}`)
}

function updateField<K extends keyof EntityField>(key: K, value: EntityField[K]) {
  if (!selectedField.value) return
  selectedField.value[key] = value
}

function sampleValue(field: EntityField) {
  if (field.type === 'boolean') return true
  if (field.type === 'integer') return 42
  if (field.type === 'decimal') return 42.5
  if (field.type === 'date') return '2026-08-11'
  if (field.type === 'enum') return platform.dictionaryById(field.enumId)?.items[0]?.code ?? 'value'
  if (field.type === 'file') return ['example.pdf']
  return field.name
}
</script>

<template>
  <div>
    <UiEmptyState v-if="!editable" title="Сущность не найдена" />
    <template v-else>
      <UiPageHeader :title="`Entity: ${editable.name}`" :description="editable.description">
        <template #actions>
          <UiButton label="Сохранить" icon="pi pi-save" severity="secondary" variant="outlined" @click="save" />
          <UiButton label="Опубликовать" icon="pi pi-send" @click="publish" />
        </template>
      </UiPageHeader>

      <div class="builder-shell">
        <UiTabs v-model="activeTab" :tabs="[{ label: 'Builder', value: 'builder' }, { label: 'Preview', value: 'preview' }]" />

        <section v-if="activeTab === 'builder'" class="builder-grid">
          <aside class="panel stack">
            <div class="inline-actions" style="justify-content: space-between">
              <h3 class="surface-title">Fields</h3>
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
              <small>{{ field.type }}</small>
            </button>
          </aside>

          <section class="panel stack">
            <h3 class="surface-title">Field properties</h3>
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
                <div class="form-field">
                  <label>Entity geometry</label>
                  <UiSelect
                    :model-value="editable.geometryType"
                    :options="geometryTypes"
                    @update:model-value="editable.geometryType = $event as GeometryType"
                  />
                </div>
                <div v-if="selectedField.type === 'enum'" class="form-field">
                  <label>Enum dictionary</label>
                  <UiSelect
                    :model-value="selectedField.enumId ?? null"
                    :options="entityDictionaryOptions"
                    @update:model-value="updateField('enumId', String($event))"
                  />
                </div>
                <div class="form-field full">
                  <label>Описание сущности</label>
                  <UiTextarea v-model="editable.description" />
                </div>
              </div>
              <div class="settings-grid">
                <label><Checkbox :model-value="selectedField.required" binary @update:model-value="updateField('required', Boolean($event))" /> Required</label>
                <label><Checkbox :model-value="selectedField.listVisible" binary @update:model-value="updateField('listVisible', Boolean($event))" /> Show in list</label>
                <label><Checkbox :model-value="selectedField.cardVisible" binary @update:model-value="updateField('cardVisible', Boolean($event))" /> Show in card</label>
                <label><Checkbox :model-value="selectedField.searchable" binary @update:model-value="updateField('searchable', Boolean($event))" /> Searchable</label>
                <label><Checkbox :model-value="selectedField.filterable" binary @update:model-value="updateField('filterable', Boolean($event))" /> Filterable</label>
              </div>
              <UiButton label="Удалить поле" severity="danger" variant="outlined" @click="deleteField(selectedField.id)" />
            </template>
          </section>
        </section>

        <section v-else class="panel stack">
          <UiTabs
            v-model="previewTab"
            :tabs="[
              { label: 'Реестр', value: 'registry' },
              { label: 'Форма', value: 'form' },
              { label: 'Карточка', value: 'card' },
            ]"
          />
          <EntityRegistry v-if="previewTab === 'registry' && previewObject" :schema="editable" :objects="[previewObject]" />
          <EntityForm v-else-if="previewTab === 'form'" :schema="editable" submit-label="Preview save" />
          <EntityPropertyList v-else-if="previewObject" :schema="editable" :object="previewObject" />
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
</style>
