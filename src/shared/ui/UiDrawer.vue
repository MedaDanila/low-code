<script setup lang="ts">
import Drawer from 'primevue/drawer'

const visible = defineModel<boolean>('visible', { default: false })

withDefaults(
  defineProps<{
    header?: string
    position?: 'left' | 'right' | 'top' | 'bottom'
  }>(),
  {
    position: 'right',
  },
)
</script>

<template>
  <Drawer v-model:visible="visible" :header="header" :position="position">
    <slot />
  </Drawer>
</template>
