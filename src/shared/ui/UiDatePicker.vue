<script setup lang="ts">
import DatePicker from 'primevue/datepicker'

const model = defineModel<Date | null>({ default: null })

withDefaults(
  defineProps<{
    id?: string
    placeholder?: string
    showTime?: boolean
  }>(),
  {
    showTime: false,
  },
)
</script>

<template>
  <DatePicker
    v-model="model"
    :input-id="id"
    :placeholder="placeholder"
    :show-time="showTime"
    date-format="dd.mm.yy"
    show-icon
    fluid
  />
</template>
