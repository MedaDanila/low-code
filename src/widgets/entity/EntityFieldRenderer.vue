<script setup lang="ts">
import { computed } from 'vue'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import UiDatePicker from '../../shared/ui/UiDatePicker.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTextarea from '../../shared/ui/UiTextarea.vue'
import { usePlatformStore } from '../../stores/platform'
import type { EntityField, ObjectValue } from '../../shared/types/domain'

const props = defineProps<{
  field: EntityField
  modelValue: ObjectValue
  invalid?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ObjectValue]
}>()

const platform = usePlatformStore()

const textModel = computed<string | null>({
  get: () => {
    if (typeof props.modelValue === 'string') return props.modelValue
    if (typeof props.modelValue === 'number') return String(props.modelValue)
    return ''
  },
  set: (value) => emit('update:modelValue', value),
})

const numberModel = computed<number | null>({
  get: () => (typeof props.modelValue === 'number' ? props.modelValue : null),
  set: (value) => emit('update:modelValue', value),
})

const booleanModel = computed<boolean>({
  get: () => props.modelValue === true,
  set: (value) => emit('update:modelValue', value),
})

const dateModel = computed<Date | null>({
  get: () => (typeof props.modelValue === 'string' && props.modelValue ? new Date(props.modelValue) : null),
  set: (value) => emit('update:modelValue', value ? value.toISOString().slice(0, props.field.type === 'date' ? 10 : 19) : null),
})

const selectModel = computed<string | number | boolean | null>({
  get: () => (Array.isArray(props.modelValue) ? null : props.modelValue),
  set: (value) => emit('update:modelValue', value),
})

const selectOptions = computed(() => {
  if (props.field.type === 'enum') {
    return (
      platform
        .dictionaryById(props.field.enumId)
        ?.items.filter((item) => item.active)
        .map((item) => ({ label: item.name, value: item.code })) ?? []
    )
  }
  if (props.field.type === 'reference') {
    return platform.activeSchemas.map((schema) => ({ label: schema.name, value: schema.id }))
  }
  return []
})

function updateFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? []).map((file) => file.name)
  emit('update:modelValue', files)
}
</script>

<template>
  <div>
    <UiInput
      v-if="field.type === 'string'"
      v-model="textModel"
      :id="field.id"
      :placeholder="field.name"
      :class="{ 'p-invalid': invalid }"
    />
    <UiTextarea
      v-else-if="field.type === 'text'"
      v-model="textModel"
      :id="field.id"
      :placeholder="field.name"
      :class="{ 'p-invalid': invalid }"
    />
    <InputNumber
      v-else-if="field.type === 'integer' || field.type === 'decimal'"
      v-model="numberModel"
      :input-id="field.id"
      :min-fraction-digits="field.type === 'decimal' ? 2 : 0"
      :max-fraction-digits="field.type === 'decimal' ? 2 : 0"
      :class="{ 'p-invalid': invalid }"
      fluid
    />
    <label v-else-if="field.type === 'boolean'" class="checkbox-field">
      <Checkbox v-model="booleanModel" :input-id="field.id" binary />
      <span>{{ field.name }}</span>
    </label>
    <UiDatePicker
      v-else-if="field.type === 'date' || field.type === 'datetime'"
      v-model="dateModel"
      :id="field.id"
      :show-time="field.type === 'datetime'"
      :placeholder="field.name"
      :class="{ 'p-invalid': invalid }"
    />
    <UiSelect
      v-else-if="field.type === 'enum' || field.type === 'reference'"
      :id="field.id"
      v-model="selectModel"
      :options="selectOptions"
      :class="{ 'p-invalid': invalid }"
    />
    <input v-else class="file-input" type="file" multiple @change="updateFiles" />
  </div>
</template>

<style scoped>
.checkbox-field {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
}

.file-input {
  width: 100%;
  min-height: 38px;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
</style>
