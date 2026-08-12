<script setup lang="ts">
import { computed } from 'vue'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import StatusBadge from '../entity/StatusBadge.vue'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import { usePermissions } from '../../shared/lib/usePermissions'
import type { EntityObject, EntitySchema, GeoValidationResult } from '../../shared/types/domain'

const props = defineProps<{
  schema: EntitySchema
  object: EntityObject
}>()

const emit = defineEmits<{
  geoConflict: [result: GeoValidationResult]
}>()

const toast = useToast()
const auth = useAuthStore()
const platform = usePlatformStore()
const permissions = usePermissions()

const workflow = computed(() => platform.workflowByEntity(props.schema.id))
const currentState = computed(() => workflow.value?.states.find((state) => state.code === props.object.status))
const availableTransitions = computed(() => {
  if (!workflow.value || !currentState.value || !permissions.can('transition', props.schema.id)) return []
  return workflow.value.transitions.filter(
    (transition) =>
      transition.fromStateId === currentState.value?.id && permissions.canUseTransition(transition.allowedRoleIds),
  )
})

async function runTransition(transitionId: string) {
  const transition = workflow.value?.transitions.find((item) => item.id === transitionId)
  if (!transition || !auth.currentUser) return
  const missingFields = props.schema.fields.filter((field) => field.required && !props.object.values[field.code])
  if (transition.validateRequiredFields && missingFields.length > 0) {
    toast.add({
      severity: 'warn',
      summary: 'Проверьте обязательные поля',
      detail: missingFields.map((field) => field.name).join(', '),
      life: 3200,
    })
    return
  }
  if (transition.validateGeoRules) {
    const result = await platform.validateObject(props.object)
    const hasBlockingError = result.conflicts.some(
      (conflict) => conflict.rule.severity === 'error' && conflict.rule.blockWorkflowTransition,
    )
    if (hasBlockingError) {
      emit('geoConflict', result)
      return
    }
  }
  await platform.applyWorkflowTransition(props.object.id, transition.id, auth.currentUser.id)
  toast.add({ severity: 'success', summary: 'Статус обновлён', detail: transition.name, life: 2400 })
}
</script>

<template>
  <div class="workflow-panel">
    <div class="workflow-panel__header">
      <span>Текущий статус</span>
      <StatusBadge :status="object.status" />
    </div>
    <div class="workflow-panel__actions">
      <UiButton
        v-for="transition in availableTransitions"
        :key="transition.id"
        :label="transition.name"
        icon="pi pi-arrow-right"
        @click="runTransition(transition.id)"
      />
      <p v-if="availableTransitions.length === 0" class="muted">Нет доступных действий для текущей роли.</p>
    </div>
  </div>
</template>

<style scoped>
.workflow-panel {
  display: grid;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-muted);
}

.workflow-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.workflow-panel__header span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.workflow-panel__actions {
  display: grid;
  gap: 8px;
}
</style>
