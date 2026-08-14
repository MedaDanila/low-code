<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { formatDate } from '../../shared/lib/format'
import { usePlatformStore } from '../../stores/platform'
import StatusBadge from '../../widgets/entity/StatusBadge.vue'
import type { EntitySchema } from '../../shared/types/domain'

const router = useRouter()
const toast = useToast()
const platform = usePlatformStore()
const openActionMenuId = ref('')
const actionMenuStyle = ref<Record<string, string>>({})

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

const geometryLabels: Record<string, string> = {
  none: 'Без геометрии',
  point: 'Точка',
  lineString: 'Линия',
  polygon: 'Полигон',
}

function open(row: Record<string, unknown>) {
  const schema = row.__schema as EntitySchema
  openActionMenuId.value = ''
  router.push(`/admin/entities/${schema.id}`)
}

async function duplicate(schema: EntitySchema) {
  openActionMenuId.value = ''
  const copy = await platform.duplicateSchema(schema.id)
  toast.add({ severity: 'success', summary: 'Сущность скопирована', detail: copy.name, life: 2400 })
}

async function archive(schema: EntitySchema) {
  openActionMenuId.value = ''
  await platform.archiveSchema(schema.id)
  toast.add({ severity: 'info', summary: 'Сущность архивирована', detail: schema.name, life: 2400 })
}

async function remove(schema: EntitySchema) {
  openActionMenuId.value = ''
  const confirmed = window.confirm(`Удалить сущность «${schema.name}»? Это также удалит её объекты, справочники, задачи, слои и настройки.`)
  if (!confirmed) return
  await platform.deleteSchema(schema.id)
  toast.add({ severity: 'success', summary: 'Сущность удалена', detail: schema.name, life: 2400 })
}

function toggleActionMenu(schemaId: string, event: MouseEvent) {
  openActionMenuId.value = openActionMenuId.value === schemaId ? '' : schemaId
  if (!openActionMenuId.value) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const menuWidth = 168
  actionMenuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth))}px`,
  }
}
</script>

<template>
  <div>
    <UiPageHeader title="Сущности" description="Модели данных, для которых автоматически создаётся интерфейс приложения.">
      <template #actions>
        <UiButton label="Создать сущность" icon="pi pi-plus" @click="router.push('/admin/entities/new')" />
      </template>
    </UiPageHeader>
    <div class="panel">
      <UiEmptyState
        v-if="rows.length === 0"
        title="Сущностей пока нет"
        description="Создайте первую сущность, чтобы появились реестры, справочники, импорт и API."
      >
        <UiButton label="Создать сущность" icon="pi pi-plus" @click="router.push('/admin/entities/new')" />
      </UiEmptyState>
      <UiTable
        v-else
        :rows="rows"
        :columns="[
          { field: 'name', header: 'Название' },
          { field: 'geometryType', header: 'Тип геометрии' },
          { field: 'fields', header: 'Количество полей' },
          { field: 'createdAt', header: 'Создана' },
          { field: 'status', header: 'Статус' },
          { field: 'actions', header: '', sortable: false, width: '64px' },
        ]"
        @row-click="open"
      >
        <template #cell="{ row, column }">
          <StatusBadge v-if="column.field === 'status'" :status="String(row.status)" />
          <div v-else-if="column.field === 'actions'" class="entity-actions" @click.stop>
            <button
              class="entity-actions__trigger"
              type="button"
              aria-label="Действия"
              @click="toggleActionMenu(String(row.id), $event)"
            >
              ⋯
            </button>
            <Teleport to="body">
              <div v-if="openActionMenuId === row.id" class="entity-actions__menu" :style="actionMenuStyle">
                <button type="button" @click="open(row)">Открыть</button>
                <button type="button" @click="duplicate(row.__schema as EntitySchema)">Дублировать</button>
                <button type="button" @click="archive(row.__schema as EntitySchema)">Архивировать</button>
                <button class="danger" type="button" @click="remove(row.__schema as EntitySchema)">Удалить</button>
              </div>
            </Teleport>
          </div>
          <span v-else-if="column.field === 'geometryType'">{{ geometryLabels[String(row.geometryType)] ?? row.geometryType }}</span>
          <span v-else>{{ row[column.field] }}</span>
        </template>
      </UiTable>
    </div>
  </div>
</template>

<style scoped>
.entity-actions {
  position: relative;
  display: flex;
  justify-content: flex-end;
}

.entity-actions__trigger {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.entity-actions__trigger:hover,
.entity-actions__trigger:focus-visible {
  border-color: #bfdbfe;
  color: var(--color-text);
  outline: none;
}

.entity-actions__menu {
  position: fixed;
  z-index: 1100;
  min-width: 168px;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.16);
}

.entity-actions__menu button {
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.entity-actions__menu button:hover,
.entity-actions__menu button:focus-visible {
  background: var(--color-accent-soft);
  outline: none;
}

.entity-actions__menu button.danger {
  color: #dc2626;
}
</style>
