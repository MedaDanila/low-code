<script setup lang="ts">
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import UiInput from '../../shared/ui/UiInput.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import type { GeoOperator, GeoRule } from '../../shared/types/domain'

const rule = defineModel<GeoRule>({ required: true })

defineProps<{
  entityOptions: { label: string; value: string }[]
}>()

const operators: { label: string; value: GeoOperator }[] = [
  { label: 'пересекается', value: 'INTERSECTS' },
  { label: 'находится внутри', value: 'WITHIN' },
  { label: 'на расстоянии', value: 'DISTANCE' },
]

const severityOptions = [
  { label: 'Предупреждение', value: 'warning' },
  { label: 'Ошибка', value: 'error' },
]
</script>

<template>
  <div class="geo-rule-builder">
    <div class="rule-line">
      <span>Когда</span>
      <strong>Геометрия текущего объекта</strong>
      <UiSelect v-model="rule.operator" :options="operators" />
      <span>объектами слоя</span>
      <UiSelect v-model="rule.targetEntityId" :options="entityOptions" />
    </div>
    <div v-if="rule.operator === 'DISTANCE'" class="form-field">
      <label>Расстояние, метров</label>
      <InputNumber v-model="rule.distanceMeters" :min="1" fluid />
    </div>
    <div class="form-grid">
      <div class="form-field">
        <label>Название</label>
        <UiInput v-model="rule.name" />
      </div>
      <div class="form-field">
        <label>Сущность</label>
        <UiSelect v-model="rule.entityId" :options="entityOptions" />
      </div>
      <div class="form-field">
        <label>Важность</label>
        <UiSelect v-model="rule.severity" :options="severityOptions" />
      </div>
      <div class="form-field full">
        <label>Текст</label>
        <UiInput v-model="rule.message" />
      </div>
    </div>
    <label class="blocker">
      <Checkbox v-model="rule.blockWorkflowTransition" binary />
      Блокировать переход процесса
    </label>
  </div>
</template>

<style scoped>
.geo-rule-builder {
  display: grid;
  gap: 16px;
}

.rule-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-muted);
}

.blocker {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
