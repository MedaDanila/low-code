<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import UiDatePicker from '../../shared/ui/UiDatePicker.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTextarea from '../../shared/ui/UiTextarea.vue'
import { suggestAddresses, type DadataAddressSuggestion } from '../../shared/api/dadata'
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
const addressQuery = ref('')
const addressSuggestions = ref<DadataAddressSuggestion[]>([])
const addressLoading = ref(false)
const addressOpen = ref(false)
let addressTimer: ReturnType<typeof setTimeout> | undefined
let addressAbortController: AbortController | null = null

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

watch(
  () => [props.field.id, props.modelValue],
  () => {
    if (props.field.type !== 'address') return
    addressQuery.value = typeof props.modelValue === 'string' ? props.modelValue : ''
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (addressTimer) clearTimeout(addressTimer)
  addressAbortController?.abort()
})

function updateAddressQuery(event: Event) {
  const nextQuery = (event.target as HTMLInputElement).value
  addressQuery.value = nextQuery
  addressOpen.value = true
  emit('update:modelValue', nextQuery)
  queueAddressSuggestions(nextQuery)
}

function focusAddressField() {
  addressOpen.value = true
  queueAddressSuggestions(addressQuery.value)
}

function blurAddressField() {
  window.setTimeout(() => {
    addressOpen.value = false
  }, 120)
}

function selectAddress(suggestion: DadataAddressSuggestion) {
  addressQuery.value = suggestion.value
  addressSuggestions.value = []
  addressOpen.value = false
  emit('update:modelValue', suggestion.value)
}

function queueAddressSuggestions(query: string) {
  if (addressTimer) clearTimeout(addressTimer)
  addressAbortController?.abort()

  if (query.trim().length < 3) {
    addressSuggestions.value = []
    addressLoading.value = false
    return
  }

  addressTimer = setTimeout(async () => {
    addressAbortController = new AbortController()
    addressLoading.value = true
    try {
      addressSuggestions.value = await suggestAddresses(query, addressAbortController.signal)
    } catch {
      addressSuggestions.value = []
    } finally {
      addressLoading.value = false
    }
  }, 240)
}

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
    <div v-else-if="field.type === 'address'" class="address-combobox">
      <input
        :id="field.id"
        class="address-combobox__input"
        :class="{ 'p-invalid': invalid }"
        :value="addressQuery"
        :placeholder="field.name"
        autocomplete="off"
        @input="updateAddressQuery"
        @focus="focusAddressField"
        @blur="blurAddressField"
      />
      <div v-if="addressOpen && (addressSuggestions.length > 0 || addressLoading)" class="address-combobox__menu">
        <div v-if="addressLoading" class="address-combobox__loading">Ищем адрес...</div>
        <button
          v-for="suggestion in addressSuggestions"
          :key="suggestion.unrestrictedValue"
          class="address-combobox__option"
          type="button"
          @mousedown.prevent="selectAddress(suggestion)"
        >
          {{ suggestion.value }}
        </button>
      </div>
    </div>
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

.address-combobox {
  position: relative;
}

.address-combobox__input {
  width: 100%;
  min-height: 38px;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.address-combobox__input:focus {
  border-color: #bfdbfe;
  outline: none;
}

.address-combobox__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.16);
}

.address-combobox__option,
.address-combobox__loading {
  width: 100%;
  padding: 9px 10px;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
}

.address-combobox__option {
  cursor: pointer;
}

.address-combobox__option:hover,
.address-combobox__option:focus-visible {
  background: var(--color-accent-soft);
  outline: none;
}

.address-combobox__loading {
  color: var(--color-text-secondary);
}
</style>
