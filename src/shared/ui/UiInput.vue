<script setup lang="ts">
import InputText from 'primevue/inputtext'

const model = defineModel<string | null>({ default: '' })

withDefaults(
  defineProps<{
    id?: string
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)
</script>

<template>
  <InputText v-model="model" :input-id="id" :placeholder="placeholder" :disabled="disabled" />
</template>
