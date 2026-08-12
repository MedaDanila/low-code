<script setup lang="ts">
import UiBadge from '../../shared/ui/UiBadge.vue'
import UiButton from '../../shared/ui/UiButton.vue'
import { formatValue } from '../../shared/lib/format'
import type { GeoValidationResult } from '../../shared/types/domain'

defineProps<{
  result: GeoValidationResult
}>()

const emit = defineEmits<{
  showOnMap: []
  close: []
}>()
</script>

<template>
  <div class="geo-result">
    <template v-if="result.ok">
      <UiBadge label="Проверка пройдена" tone="success" />
      <p>Пространственные правила не нашли конфликтов.</p>
    </template>
    <template v-else>
      <UiBadge label="Обнаружено пересечение" tone="danger" />
      <div v-for="conflict in result.conflicts" :key="conflict.rule.id + conflict.targetObject.id" class="geo-result__conflict">
        <strong>{{ conflict.rule.message }}</strong>
        <span>{{ conflict.targetSchema.name }} №{{ formatValue(conflict.targetObject.values.number) }}</span>
        <span v-if="conflict.targetObject.values.address">Адрес: {{ formatValue(conflict.targetObject.values.address) }}</span>
        <span v-if="conflict.targetObject.values.endDate">Гарантия: до {{ formatValue(conflict.targetObject.values.endDate) }}</span>
        <UiBadge :label="conflict.rule.severity.toUpperCase()" :tone="conflict.rule.severity === 'error' ? 'danger' : 'warning'" />
      </div>
    </template>
    <div class="inline-actions">
      <UiButton label="Показать на карте" severity="secondary" variant="outlined" @click="emit('showOnMap')" />
      <UiButton label="Продолжить редактирование" @click="emit('close')" />
    </div>
  </div>
</template>

<style scoped>
.geo-result {
  display: grid;
  gap: 14px;
}

.geo-result__conflict {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--color-danger-soft);
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
}

.geo-result__conflict span {
  color: var(--color-text-secondary);
}
</style>
