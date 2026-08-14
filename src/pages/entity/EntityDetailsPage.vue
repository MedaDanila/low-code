<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useRoute } from 'vue-router'
import UiDialog from '../../shared/ui/UiDialog.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import { resolveAddressGeometryForValues } from '../../shared/lib/addressGeometry'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import EntityCard from '../../widgets/entity/EntityCard.vue'
import EntityForm from '../../widgets/entity/EntityForm.vue'
import GeoValidationResult from '../../widgets/geo/GeoValidationResult.vue'
import type { DomainGeometry, EntitySchema, GeoValidationResult as GeoValidationResultType } from '../../shared/types/domain'
import type { EntityFormPayload } from '../../widgets/entity/types'

type EntityObjectTab = 'main' | 'map' | 'documents' | 'history'
type EntityEditTab = 'main' | 'map' | 'documents'

const route = useRoute()
const toast = useToast()
const auth = useAuthStore()
const platform = usePlatformStore()
const editing = ref(false)
const activeTab = ref<EntityObjectTab>('main')
const editingTab = ref<EntityEditTab>('main')
const saving = ref(false)
const validationResult = ref<GeoValidationResultType | null>(null)
const validationVisible = ref(false)
const conflictGeometries = ref<DomainGeometry[]>([])

const schema = computed(() => platform.schemaByCode(String(route.params.entityCode)))
const object = computed(() => platform.objectById(String(route.params.objectId)))

async function save(payload: EntityFormPayload) {
  if (!schema.value || !object.value || !auth.currentUser) return
  saving.value = true
  try {
    const addressChanged = hasAddressChanged(schema.value, object.value.values, payload.values)
    const resolved = addressChanged
      ? await resolveAddressGeometryForValues(schema.value, payload.values)
      : { values: payload.values, geometry: payload.geometry, status: '' }
    await platform.updateObject({
      id: object.value.id,
      values: resolved.values,
      geometry: resolved.geometry,
      actorId: auth.currentUser.id,
    })
    editing.value = false
    toast.add({
      severity: 'success',
      summary: 'Изменения сохранены',
      detail: addressChanged ? resolved.status : undefined,
      life: 2800,
    })
  } finally {
    saving.value = false
  }
}

function startEdit(tab: EntityObjectTab = activeTab.value): void {
  editingTab.value = tab === 'map' ? 'map' : tab === 'documents' ? 'documents' : 'main'
  editing.value = true
}

function cancelEdit(): void {
  editing.value = false
}

function hasAddressChanged(
  schema: EntitySchema,
  currentValues: EntityFormPayload['values'],
  nextValues: EntityFormPayload['values'],
): boolean {
  return schema.fields
    .filter((field) => field.type === 'address')
    .some((field) => String(currentValues[field.code] ?? '').trim() !== String(nextValues[field.code] ?? '').trim())
}

async function validate(payload: EntityFormPayload) {
  if (!object.value) return
  const result = await platform.validateObject({ ...object.value, values: payload.values, geometry: payload.geometry })
  validationResult.value = result
  conflictGeometries.value = result.conflicts.map((conflict) => conflict.targetObject.geometry).filter(Boolean) as DomainGeometry[]
  validationVisible.value = true
}
</script>

<template>
  <div class="entity-details" :class="{ 'entity-details--map': activeTab === 'map' || (editing && editingTab === 'map') }">
    <UiEmptyState v-if="!schema || !object" title="Объект не найден" />
    <div v-else-if="editing" class="entity-details__editor">
      <EntityForm
        :schema="schema"
        :object="object"
        :saving="saving"
        :initial-tab="editingTab"
        :conflict-geometries="conflictGeometries"
        submit-label="Сохранить изменения"
        cancel-label="Выйти из редактирования"
        @submit="save"
        @validate="validate"
        @cancel="cancelEdit"
      />
    </div>
    <EntityCard v-else v-model:active-tab="activeTab" :schema="schema" :object="object" @edit="startEdit" />
    <UiDialog v-if="validationResult" v-model:visible="validationVisible" header="Проверка геометрии">
      <GeoValidationResult
        :result="validationResult"
        @close="validationVisible = false"
        @show-on-map="validationVisible = false"
      />
    </UiDialog>
  </div>
</template>

<style scoped>
.entity-details {
  min-height: calc(100vh - 128px);
}

.entity-details__editor {
  display: grid;
  gap: 16px;
}

.entity-details--map .entity-details__editor {
  min-height: calc(100vh - 128px);
}
</style>
