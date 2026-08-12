<script setup lang="ts">
import Button from 'primevue/button'

withDefaults(
  defineProps<{
    label?: string
    icon?: string
    severity?: 'secondary' | 'success' | 'info' | 'warn' | 'danger' | 'contrast'
    variant?: 'outlined' | 'text'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    type: 'button',
    disabled: false,
    loading: false,
  },
)
</script>

<template>
  <Button
    :type="type"
    :label="label"
    :icon="icon"
    :severity="severity"
    :variant="variant"
    :disabled="disabled"
    :loading="loading"
  >
    <slot />
  </Button>
</template>
