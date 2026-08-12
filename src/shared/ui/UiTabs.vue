<script setup lang="ts">
interface UiTab {
  label: string
  value: string
}

const model = defineModel<string>({ required: true })

defineProps<{
  tabs: UiTab[]
}>()
</script>

<template>
  <div class="ui-tabs" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      class="ui-tabs__button"
      :class="{ active: model === tab.value }"
      role="tab"
      :aria-selected="model === tab.value"
      @click="model = tab.value"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.ui-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.ui-tabs__button {
  min-height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-weight: 650;
}

.ui-tabs__button.active {
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08);
}
</style>
