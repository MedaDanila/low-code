<script setup lang="ts">
withDefaults(
  defineProps<{
    eyebrow?: string
    title: string
    description?: string
  }>(),
  {
    eyebrow: '',
    description: '',
  },
)
</script>

<template>
  <div class="page-header">
    <div>
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <h2>
        <slot name="title">{{ title }}</slot>
      </h2>
      <p v-if="description" class="page-header__description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.18;
  letter-spacing: 0;
}

.page-header__description {
  margin: 6px 0 0;
  color: var(--color-text-secondary);
}

.page-header__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
