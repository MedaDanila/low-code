<script setup lang="ts">
import Select from 'primevue/select'

interface UiSelectOption {
  label: string
  value: string | number | boolean
}

const model = defineModel<string | number | boolean | null>({ default: null })

withDefaults(
  defineProps<{
    id?: string
    options: UiSelectOption[]
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    disabled: false,
    placeholder: 'Выберите значение',
  },
)
</script>

<template>
  <Select
    v-model="model"
    :input-id="id"
    :options="options"
    option-label="label"
    option-value="value"
    :placeholder="placeholder"
    :disabled="disabled"
  />
</template>
