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

const route = useRoute()
const toast = useToast()
const auth = useAuthStore()
const platform = usePlatformStore()
const editing = ref(false)
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
  <div>
    <UiEmptyState v-if="!schema || !object" title="Объект не найден" />
    <div v-else-if="editing" class="panel">
      <EntityForm
        :schema="schema"
        :object="object"
        :saving="saving"
        :conflict-geometries="conflictGeometries"
        submit-label="Сохранить изменения"
        @submit="save"
        @validate="validate"
      >
        <template #secondary>
          <button class="icon-button" type="button" aria-label="Закрыть форму" @click="editing = false">
            <span>×</span>
          </button>
        </template>
      </EntityForm>
    </div>
    <EntityCard v-else :schema="schema" :object="object" @edit="editing = true" />
    <UiDialog v-if="validationResult" v-model:visible="validationVisible" header="Проверка геометрии">
      <GeoValidationResult
        :result="validationResult"
        @close="validationVisible = false"
        @show-on-map="validationVisible = false"
      />
    </UiDialog>
  </div>
</template>
