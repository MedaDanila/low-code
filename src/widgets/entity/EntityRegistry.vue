<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import UiToolbar from '../../shared/ui/UiToolbar.vue'
import { formatDate, formatValue } from '../../shared/lib/format'
import { usePermissions } from '../../shared/lib/usePermissions'
import { usePlatformStore } from '../../stores/platform'
import type { EntityObject, EntitySchema } from '../../shared/types/domain'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{
  schema: EntitySchema
  objects: EntityObject[]
  loading?: boolean
}>()

const router = useRouter()
const toast = useToast()
const platform = usePlatformStore()
const permissions = usePermissions()
const search = ref('')
const status = ref<string | number | boolean | null>('all')
const openActionMenuId = ref('')
const actionMenuStyle = ref<Record<string, string>>({})

const visibleFields = computed(() => props.schema.fields.filter((field) => field.listVisible).sort((a, b) => a.order - b.order))
const columns = computed(() => [
  ...visibleFields.value.map((field) => ({ field: field.code, header: field.name, sortable: true })),
  { field: 'status', header: 'Статус', sortable: true, width: '148px' },
  { field: 'actions', header: '', sortable: false, width: '64px' },
])

const statusOptions = [
  { label: 'Все статусы', value: 'all' },
  { label: 'Опубликовано', value: 'published' },
  { label: 'Данные неполные', value: 'incomplete' },
]

const rows = computed(() =>
  props.objects
    .filter((object) => {
      const query = search.value.trim().toLowerCase()
      const statusMatches = status.value === 'all' || object.status === status.value
      if (!query) return statusMatches
      const searchableText = props.schema.fields
        .filter((field) => field.searchable)
        .map((field) => object.values[field.code])
        .join(' ')
        .toLowerCase()
      return statusMatches && searchableText.includes(query)
    })
    .map((object) => {
      const row: Record<string, unknown> = { id: object.id, status: object.status, __object: object }
      visibleFields.value.forEach((field) => {
        const raw = object.values[field.code]
        const enumLabel = platform.dictionaryById(field.enumId)?.items.find((item) => item.code === raw)?.name
        row[field.code] = field.type === 'date' || field.type === 'datetime' ? formatDate(raw) : enumLabel ?? formatValue(raw)
      })
      return row
    }),
)

function openRow(row: Record<string, unknown>) {
  const object = row.__object as EntityObject
  openActionMenuId.value = ''
  router.push(`/app/entities/${props.schema.code}/${object.id}`)
}

function createObject() {
  router.push(`/app/entities/${props.schema.code}/new`)
}

async function removeObject(object: EntityObject) {
  openActionMenuId.value = ''
  const title = objectTitle(object)
  const confirmed = window.confirm(`Удалить запись «${title}»?`)
  if (!confirmed) return
  await platform.deleteObject(object.id)
  toast.add({ severity: 'success', summary: 'Запись удалена', detail: title, life: 2400 })
}

function toggleActionMenu(objectId: string, event: MouseEvent) {
  openActionMenuId.value = openActionMenuId.value === objectId ? '' : objectId
  if (!openActionMenuId.value) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const menuWidth = 150
  actionMenuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth))}px`,
  }
}

function objectTitle(object: EntityObject): string {
  return String(object.values.name ?? object.values.title ?? object.values.address ?? object.id)
}
</script>

<template>
  <div class="registry">
    <UiToolbar>
      <UiInput v-model="search" placeholder="Поиск" />
      <UiSelect v-model="status" :options="statusOptions" />
      <UiButton label="Фильтры" icon="pi pi-filter" severity="secondary" variant="outlined" />
      <UiButton label="Период" icon="pi pi-calendar" severity="secondary" variant="outlined" />
      <UiButton label="Колонки" icon="pi pi-table" severity="secondary" variant="outlined" />
      <template #actions>
        <UiButton label="Экспорт" icon="pi pi-download" severity="secondary" variant="outlined" />
        <UiButton
          v-if="permissions.can('create', schema.id)"
          :label="`Создать ${schema.name.toLowerCase()}`"
          icon="pi pi-plus"
          @click="createObject"
        />
      </template>
    </UiToolbar>

    <UiEmptyState
      v-if="!loading && rows.length === 0"
      title="Объектов пока нет"
      description="После создания объект появится в реестре и на карте, если у сущности есть геометрия."
    />
    <UiTable
      v-else
      :rows="rows"
      :columns="columns"
      :loading="loading"
      empty-message="Нет объектов"
      @row-click="openRow"
    >
      <template #cell="{ row, column }">
        <StatusBadge v-if="column.field === 'status'" :status="String(row.status ?? '')" />
        <div v-else-if="column.field === 'actions'" class="registry-actions" @click.stop>
          <button
            class="registry-actions__trigger"
            type="button"
            aria-label="Действия"
            @click="toggleActionMenu(String(row.id), $event)"
          >
            ⋯
          </button>
          <Teleport to="body">
            <div v-if="openActionMenuId === row.id" class="registry-actions__menu" :style="actionMenuStyle">
              <button type="button" @click="openRow(row)">Открыть</button>
              <button
                v-if="permissions.can('delete', schema.id)"
                class="danger"
                type="button"
                @click="removeObject(row.__object as EntityObject)"
              >
                Удалить
              </button>
            </div>
          </Teleport>
        </div>
        <span v-else>{{ row[column.field] }}</span>
      </template>
    </UiTable>
  </div>
</template>

<style scoped>
.registry {
  display: grid;
  gap: 14px;
}

.registry-actions {
  display: flex;
  justify-content: flex-end;
}

.registry-actions__trigger {
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

.registry-actions__trigger:hover,
.registry-actions__trigger:focus-visible {
  border-color: #bfdbfe;
  color: var(--color-text);
  outline: none;
}

.registry-actions__menu {
  position: fixed;
  z-index: 1100;
  min-width: 150px;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.16);
}

.registry-actions__menu button {
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

.registry-actions__menu button:hover,
.registry-actions__menu button:focus-visible {
  background: var(--color-accent-soft);
  outline: none;
}

.registry-actions__menu button.danger {
  color: #dc2626;
}
</style>
