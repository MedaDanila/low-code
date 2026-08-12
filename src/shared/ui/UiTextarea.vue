<script setup lang="ts">
import Textarea from 'primevue/textarea'

const model = defineModel<string | null>({ default: '' })

withDefaults(
  defineProps<{
    id?: string
    placeholder?: string
    rows?: number
  }>(),
  {
    rows: 4,
  },
)
</script>

<template>
  <Textarea v-model="model" :input-id="id" :placeholder="placeholder" :rows="rows" auto-resize />
</template>
