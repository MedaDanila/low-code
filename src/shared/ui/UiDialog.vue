<script setup lang="ts">
import Dialog from 'primevue/dialog'

const visible = defineModel<boolean>('visible', { default: false })

withDefaults(
  defineProps<{
    header?: string
    width?: string
  }>(),
  {
    width: '560px',
  },
)
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="header" :style="{ width }">
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </Dialog>
</template>
