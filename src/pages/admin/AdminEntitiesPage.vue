<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { formatDate } from '../../shared/lib/format'
import { usePlatformStore } from '../../stores/platform'
import StatusBadge from '../../widgets/entity/StatusBadge.vue'
import type { EntitySchema } from '../../shared/types/domain'

const router = useRouter()
const toast = useToast()
const platform = usePlatformStore()

const rows = computed<Record<string, unknown>[]>(() =>
  platform.entitySchemas.map((schema) => ({
    id: schema.id,
    name: schema.name,
    geometryType: schema.geometryType,
    fields: schema.fields.length,
    createdAt: formatDate(schema.createdAt),
    status: schema.status,
    __schema: schema,
  })),
)

function open(row: Record<string, unknown>) {
  const schema = row.__schema as EntitySchema
  router.push(`/admin/entities/${schema.id}`)
}

async function duplicate(schema: EntitySchema) {
  const copy = await platform.duplicateSchema(schema.id)
  toast.add({ severity: 'success', summary: 'Сущность скопирована', detail: copy.name, life: 2400 })
}

async function archive(schema: EntitySchema) {
  await platform.archiveSchema(schema.id)
  toast.add({ severity: 'info', summary: 'Сущность архивирована', detail: schema.name, life: 2400 })
}
</script>

<template>
  <div>
    <UiPageHeader title="Сущности" description="Metadata модели, которые автоматически получают runtime UI.">
      <template #actions>
        <UiButton label="Создать сущность" icon="pi pi-plus" @click="router.push('/admin/entities/new')" />
      </template>
    </UiPageHeader>
    <div class="panel">
      <UiTable
        :rows="rows"
        :columns="[
          { field: 'name', header: 'Название' },
          { field: 'geometryType', header: 'Тип геометрии' },
          { field: 'fields', header: 'Количество полей' },
          { field: 'createdAt', header: 'Создана' },
          { field: 'status', header: 'Статус' },
          { field: 'actions', header: 'Действия', width: '210px' },
        ]"
        @row-click="open"
      >
        <template #cell="{ row, column }">
          <StatusBadge v-if="column.field === 'status'" :status="String(row.status)" />
          <div v-else-if="column.field === 'actions'" class="inline-actions" @click.stop>
            <UiButton label="Open" severity="secondary" variant="outlined" @click="open(row)" />
            <UiButton label="Duplicate" severity="secondary" variant="outlined" @click="duplicate(row.__schema as EntitySchema)" />
            <UiButton label="Archive" severity="danger" variant="outlined" @click="archive(row.__schema as EntitySchema)" />
          </div>
          <span v-else>{{ row[column.field] }}</span>
        </template>
      </UiTable>
    </div>
  </div>
</template>
