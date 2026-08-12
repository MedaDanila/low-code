<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
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
const platform = usePlatformStore()
const permissions = usePermissions()
const search = ref('')
const status = ref<string | number | boolean | null>('all')

const visibleFields = computed(() => props.schema.fields.filter((field) => field.listVisible).sort((a, b) => a.order - b.order))
const columns = computed(() => [
  ...visibleFields.value.map((field) => ({ field: field.code, header: field.name, sortable: true })),
  { field: 'status', header: 'Статус', sortable: true, width: '148px' },
])

const statusOptions = [
  { label: 'Все статусы', value: 'all' },
  { label: 'Черновик', value: 'draft' },
  { label: 'На проверке', value: 'review' },
  { label: 'Согласование', value: 'approval' },
  { label: 'В работе', value: 'active' },
  { label: 'Закрыт', value: 'closed' },
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
  router.push(`/app/entities/${props.schema.code}/${object.id}`)
}

function createObject() {
  router.push(`/app/entities/${props.schema.code}/new`)
}
</script>

<template>
  <div class="registry">
    <UiToolbar>
      <UiInput v-model="search" placeholder="Поиск" />
      <UiSelect v-model="status" :options="statusOptions" />
      <UiButton label="Filters" icon="pi pi-filter" severity="secondary" variant="outlined" />
      <UiButton label="Period" icon="pi pi-calendar" severity="secondary" variant="outlined" />
      <UiButton label="Columns" icon="pi pi-table" severity="secondary" variant="outlined" />
      <template #actions>
        <UiButton label="Export" icon="pi pi-download" severity="secondary" variant="outlined" />
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
</style>
