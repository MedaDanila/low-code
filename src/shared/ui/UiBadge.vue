<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    label: string
    tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  }>(),
  {
    tone: 'neutral',
  },
)
</script>

<template>
  <span class="ui-badge" :class="`ui-badge--${props.tone}`">{{ label }}</span>
</template>

<style scoped>
.ui-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
}

.ui-badge--neutral {
  background: #f2f4f7;
  color: #344054;
}

.ui-badge--success {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.ui-badge--warning {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.ui-badge--danger {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.ui-badge--info {
  background: var(--color-info-soft);
  color: var(--color-info);
}
</style>
