<template>
  <div class="ui-toolbar">
    <div class="ui-toolbar__main">
      <slot />
    </div>
    <div v-if="$slots.actions" class="ui-toolbar__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.ui-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.ui-toolbar__main,
.ui-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
