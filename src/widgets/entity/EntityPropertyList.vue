<script setup lang="ts">
import { computed } from 'vue'
import { formatDate, formatValue } from '../../shared/lib/format'
import { validateEntityObjectData } from '../../shared/lib/entityObjectValidation'
import { usePlatformStore } from '../../stores/platform'
import type { EntityObject, EntitySchema } from '../../shared/types/domain'

const props = defineProps<{
  schema: EntitySchema
  object: EntityObject
}>()

const platform = usePlatformStore()

const issues = computed(() =>
  validateEntityObjectData({
    schema: props.schema,
    dictionaries: platform.dictionaries.filter((dictionary) => dictionary.entityId === props.schema.id),
    values: props.object.values,
    geometry: props.object.geometry,
  }),
)

const issuesByField = computed(() => {
  const byField = new Map<string, string[]>()
  issues.value.forEach((issue) => {
    if (!issue.fieldCode) return
    byField.set(issue.fieldCode, [...(byField.get(issue.fieldCode) ?? []), issue.message])
  })
  return byField
})

const rows = computed(() =>
  props.schema.fields
    .filter((field) => field.cardVisible || issuesByField.value.has(field.code))
    .sort((a, b) => a.order - b.order)
    .map((field) => {
      const rawValue = props.object.values[field.code]
      const dictionary = platform.dictionaryById(field.enumId)
      const enumLabel = dictionary?.items.find((item) => item.code === rawValue)?.name
      const value = field.type === 'date' || field.type === 'datetime' ? formatDate(rawValue) : enumLabel ?? formatValue(rawValue)
      return {
        key: field.code,
        label: field.name,
        value,
        issues: issuesByField.value.get(field.code) ?? [],
      }
    })
    .concat(
      issues.value
        .filter((issue) => !issue.fieldCode)
        .map((issue, index) => ({
          key: `__issue_${index}`,
          label: issue.message.includes('Геометрия') ? 'Геометрия' : 'Проверка данных',
          value: issue.message.includes('Геометрия') ? 'Не указана' : 'Требуется исправление',
          issues: [issue.message],
        })),
    ),
)
</script>

<template>
  <dl class="property-list">
    <div
      v-for="row in rows"
      :key="row.key"
      class="property-list__row"
      :class="{ 'property-list__row--issue': row.issues.length > 0 }"
    >
      <dt>{{ row.label }}</dt>
      <dd>{{ row.value }}</dd>
      <p v-if="row.issues.length > 0">{{ row.issues.join('; ') }}</p>
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

.property-list__row--issue {
  border-color: #f59e0b;
  background: #fffbeb;
}

dt {
  color: var(--color-text-secondary);
  font-size: 12px;
}

dd {
  margin: 0;
  font-weight: 650;
}

p {
  margin: 2px 0 0;
  color: #92400e;
  font-size: 12px;
  font-weight: 650;
}
</style>
