<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { usePlatformStore } from '../../stores/platform'
import StatusBadge from '../../widgets/entity/StatusBadge.vue'

const router = useRouter()
const platform = usePlatformStore()

const rows = computed<Record<string, unknown>[]>(() =>
  platform.workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    entity: platform.schemaById(workflow.entityId)?.name ?? workflow.entityId,
    states: workflow.states.length,
    transitions: workflow.transitions.length,
    status: workflow.status,
  })),
)
</script>

<template>
  <div>
    <UiPageHeader title="Процессы" description="Workflow схемы сущностей." />
    <div class="panel">
      <UiTable
        :rows="rows"
        :columns="[
          { field: 'name', header: 'Название' },
          { field: 'entity', header: 'Entity' },
          { field: 'states', header: 'States' },
          { field: 'transitions', header: 'Transitions' },
          { field: 'status', header: 'Status' },
        ]"
        @row-click="router.push(`/admin/workflows/${$event.id}`)"
      >
        <template #cell="{ row, column }">
          <StatusBadge v-if="column.field === 'status'" :status="String(row.status)" />
          <span v-else>{{ row[column.field] }}</span>
        </template>
      </UiTable>
    </div>
  </div>
</template>
