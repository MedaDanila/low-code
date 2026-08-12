<script setup lang="ts">
import { computed } from 'vue'
import { formatDate, formatValue } from '../../shared/lib/format'
import { usePlatformStore } from '../../stores/platform'
import type { EntityObject, EntitySchema } from '../../shared/types/domain'

const props = defineProps<{
  schema: EntitySchema
  object: EntityObject
}>()

const platform = usePlatformStore()

const rows = computed(() =>
  props.schema.fields
    .filter((field) => field.cardVisible)
    .sort((a, b) => a.order - b.order)
    .map((field) => {
      const rawValue = props.object.values[field.code]
      const dictionary = platform.dictionaryById(field.enumId)
      const enumLabel = dictionary?.items.find((item) => item.code === rawValue)?.name
      const value = field.type === 'date' || field.type === 'datetime' ? formatDate(rawValue) : enumLabel ?? formatValue(rawValue)
      return { label: field.name, value }
    }),
)
</script>

<template>
  <dl class="property-list">
    <div v-for="row in rows" :key="row.label" class="property-list__row">
      <dt>{{ row.label }}</dt>
      <dd>{{ row.value }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.property-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.property-list__row {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

dt {
  color: var(--color-text-secondary);
  font-size: 12px;
}

dd {
  margin: 0;
  font-weight: 650;
}
</style>
