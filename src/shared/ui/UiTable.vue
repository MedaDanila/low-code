<script setup lang="ts">
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'

interface UiTableColumn {
  field: string
  header: string
  sortable?: boolean
  width?: string
}

interface RowClickEvent {
  data: Record<string, unknown>
}

withDefaults(
  defineProps<{
    rows: Record<string, unknown>[]
    columns: UiTableColumn[]
    loading?: boolean
    emptyMessage?: string
    rowsPerPage?: number
  }>(),
  {
    loading: false,
    emptyMessage: 'Нет данных',
    rowsPerPage: 10,
  },
)

const emit = defineEmits<{
  rowClick: [row: Record<string, unknown>]
}>()
</script>

<template>
  <DataTable
    :value="rows"
    :loading="loading"
    paginator
    :rows="rowsPerPage"
    row-hover
    sort-mode="multiple"
    table-style="min-width: 100%"
    @row-click="emit('rowClick', ($event as RowClickEvent).data)"
  >
    <template #empty>{{ emptyMessage }}</template>
    <Column
      v-for="column in columns"
      :key="column.field"
      :field="column.field"
      :header="column.header"
      :sortable="column.sortable ?? true"
      :style="{ width: column.width }"
    >
      <template #body="{ data }">
        <slot name="cell" :row="data" :column="column">
          {{ data[column.field] }}
        </slot>
      </template>
    </Column>
  </DataTable>
</template>
