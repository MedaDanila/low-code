<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useRoute, useRouter } from 'vue-router'
import UiDialog from '../../shared/ui/UiDialog.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import { resolveAddressGeometryForValues } from '../../shared/lib/addressGeometry'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import EntityForm from '../../widgets/entity/EntityForm.vue'
import GeoValidationResult from '../../widgets/geo/GeoValidationResult.vue'
import type { DomainGeometry, EntityObject, EntitySchema, GeoValidationResult as GeoValidationResultType } from '../../shared/types/domain'
import type { EntityFormPayload } from '../../widgets/entity/types'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const auth = useAuthStore()
const platform = usePlatformStore()
const saving = ref(false)
const validationResult = ref<GeoValidationResultType | null>(null)
const validationVisible = ref(false)
const conflictGeometries = ref<DomainGeometry[]>([])

const entityCode = computed(() => String(route.params.entityCode))
const schema = computed(() => platform.schemaByCode(entityCode.value))

async function submit(payload: EntityFormPayload) {
  if (!schema.value || !auth.currentUser) return
  saving.value = true
  try {
    const resolved = await resolveAddressGeometrySafely(schema.value, payload)
    const object = await platform.createObject({
      entityId: schema.value.id,
      values: resolved.values,
      geometry: resolved.geometry,
      actorId: auth.currentUser.id,
    })
    toast.add({
      severity: 'success',
      summary: 'Объект создан',
      detail: resolved.status || schema.value.name,
      life: 2800,
    })
    router.push(`/app/entities/${schema.value.code}/${object.id}`)
  } finally {
    saving.value = false
  }
}

async function resolveAddressGeometrySafely(
  schema: EntitySchema,
  payload: EntityFormPayload,
): Promise<{ values: EntityFormPayload['values']; geometry?: EntityFormPayload['geometry']; status: string }> {
  if (payload.geometry || !schemaHasMap(schema) || !hasAddressValue(schema, payload)) {
    return { values: payload.values, geometry: payload.geometry, status: '' }
  }

  try {
    return await resolveAddressGeometryForValues(schema, payload.values)
  } catch (cause) {
    if ((cause as DOMException).name === 'AbortError') throw cause
    return {
      values: payload.values,
      geometry: payload.geometry,
      status: 'Геокодер недоступен, адрес сохранён без геометрии',
    }
  }
}

function schemaHasMap(schema: EntitySchema): boolean {
  return schema.geometryType !== 'none' || schema.mapSettings.enabledGeometryTypes.length > 0
}

function hasAddressValue(schema: EntitySchema, payload: EntityFormPayload): boolean {
  return schema.fields
    .filter((field) => field.type === 'address')
    .some((field) => typeof payload.values[field.code] === 'string' && String(payload.values[field.code]).trim())
}

async function validate(payload: EntityFormPayload) {
  if (!schema.value || !auth.currentUser) return
  const tempObject: EntityObject = {
    id: 'temp',
    entityId: schema.value.id,
    values: payload.values,
    geometry: payload.geometry,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: auth.currentUser.id,
    updatedBy: auth.currentUser.id,
  }
  const result = await platform.validateObject(tempObject)
  validationResult.value = result
  conflictGeometries.value = result.conflicts.map((conflict) => conflict.targetObject.geometry).filter(Boolean) as DomainGeometry[]
  validationVisible.value = true
}
</script>

<template>
  <div>
    <UiPageHeader v-if="schema" :title="`Создать: ${schema.name}`" description="Форма построена по метаданным сущности." />
    <UiEmptyState v-if="!schema" title="Сущность не найдена" />
    <div v-else class="panel">
      <EntityForm
        :schema="schema"
        :saving="saving"
        :conflict-geometries="conflictGeometries"
        submit-label="Сохранить объект"
        @submit="submit"
        @validate="validate"
      />
    </div>
    <UiDialog v-if="validationResult" v-model:visible="validationVisible" header="Проверка геометрии">
      <GeoValidationResult
        :result="validationResult"
        @close="validationVisible = false"
        @show-on-map="validationVisible = false"
      />
    </UiDialog>
  </div>
</template>
