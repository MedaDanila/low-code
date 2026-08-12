<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import UiButton from '../../shared/ui/UiButton.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { usePlatformStore } from '../../stores/platform'
import StatusBadge from '../../widgets/entity/StatusBadge.vue'

const router = useRouter()
const platform = usePlatformStore()

const rows = computed<Record<string, unknown>[]>(() =>
  platform.geoRules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    entity: platform.schemaById(rule.entityId)?.name ?? rule.entityId,
    operator: rule.operator,
    target: platform.schemaById(rule.targetEntityId)?.name ?? rule.targetEntityId,
    severity: rule.severity,
    status: rule.status,
  })),
)
</script>

<template>
  <div>
    <UiPageHeader title="Гео-правила" description="Spatial validation rules для workflow и форм.">
      <template #actions>
        <UiButton label="Создать правило" icon="pi pi-plus" @click="router.push('/admin/geo-rules/new')" />
      </template>
    </UiPageHeader>
    <div class="panel">
      <UiTable
        :rows="rows"
        :columns="[
          { field: 'name', header: 'Название' },
          { field: 'entity', header: 'Entity' },
          { field: 'operator', header: 'Operator' },
          { field: 'target', header: 'Target' },
          { field: 'severity', header: 'Severity' },
          { field: 'status', header: 'Status' },
        ]"
        @row-click="router.push(`/admin/geo-rules/${$event.id}`)"
      >
        <template #cell="{ row, column }">
          <StatusBadge v-if="column.field === 'status'" :status="String(row.status)" />
          <span v-else>{{ row[column.field] }}</span>
        </template>
      </UiTable>
    </div>
  </div>
</template>
