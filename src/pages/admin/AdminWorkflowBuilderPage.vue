<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import { usePlatformStore } from '../../stores/platform'
import WorkflowBuilder from '../../widgets/workflow/WorkflowBuilder.vue'
import type { Workflow } from '../../shared/types/domain'

const route = useRoute()
const toast = useToast()
const platform = usePlatformStore()
const workflow = ref<Workflow | null>(null)

watch(
  () => [route.params.id, platform.workflows],
  () => {
    const source = platform.workflows.find((item) => item.id === String(route.params.id))
    workflow.value = source ? JSON.parse(JSON.stringify(source)) as Workflow : null
  },
  { immediate: true, deep: true },
)

async function save() {
  if (!workflow.value) return
  await platform.saveWorkflow(workflow.value)
  toast.add({ severity: 'success', summary: 'Workflow сохранён', life: 2400 })
}
</script>

<template>
  <div>
    <UiEmptyState v-if="!workflow" title="Workflow не найден" />
    <template v-else>
      <UiPageHeader :title="workflow.name" :description="platform.schemaById(workflow.entityId)?.name">
        <template #actions>
          <UiButton label="Сохранить" icon="pi pi-save" @click="save" />
        </template>
      </UiPageHeader>
      <WorkflowBuilder v-model="workflow" />
    </template>
  </div>
</template>
