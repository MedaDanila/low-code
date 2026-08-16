<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import InputNumber from 'primevue/inputnumber'
import UiButton from '../../shared/ui/UiButton.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import { suggestRussianMunicipalities, type DadataMunicipalitySuggestion } from '../../shared/api/dadata'
import { usePlatformStore } from '../../stores/platform'
import type { PlatformSettings } from '../../shared/types/domain'

const toast = useToast()
const platform = usePlatformStore()
const editable = ref<PlatformSettings | null>(null)
const municipalityQuery = ref('')
const municipalitySuggestions = ref<DadataMunicipalitySuggestion[]>([])
const municipalityLoading = ref(false)
const municipalityOpen = ref(false)
const dateTimePreview = ref(new Date())
let municipalityTimer: ReturnType<typeof setTimeout> | undefined
let municipalityAbortController: AbortController | null = null
let dateTimePreviewTimer: ReturnType<typeof setInterval> | undefined

const dateTimeFormatTemplates = [
  { value: 'dd.MM.yyyy HH:mm' },
  { value: 'dd.MM.yyyy, HH:mm' },
  { value: 'd MMMM yyyy, HH:mm' },
  { value: 'yyyy-MM-dd HH:mm' },
  { value: 'dd.MM.yy HH:mm' },
]
const dateTimeFormatOptions = computed(() =>
  dateTimeFormatTemplates.map((template) => ({
    label: formatDateTimePreview(dateTimePreview.value, template.value),
    value: template.value,
  })),
)

onMounted(() => {
  dateTimePreviewTimer = setInterval(() => {
    dateTimePreview.value = new Date()
  }, 1_000)
})

onBeforeUnmount(() => {
  if (dateTimePreviewTimer) clearInterval(dateTimePreviewTimer)
})

watch(
  () => platform.settings,
  (settings) => {
    editable.value = settings ? JSON.parse(JSON.stringify(settings)) as PlatformSettings : null
    municipalityQuery.value = editable.value?.municipalityName ?? ''
  },
  { immediate: true, deep: true },
)

async function save() {
  if (!editable.value) return
  await platform.saveSettings(editable.value)
  toast.add({ severity: 'success', summary: 'Настройки сохранены', life: 2200 })
}

async function resetDemo() {
  await platform.resetDemoData()
  toast.add({ severity: 'info', summary: 'Данные очищены', life: 2200 })
}

function updateMunicipalityQuery(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  municipalityQuery.value = value
  if (editable.value) editable.value.municipalityName = value
  municipalityOpen.value = true
  queueMunicipalitySuggestions(value)
}

function focusMunicipalityField(): void {
  municipalityOpen.value = true
  queueMunicipalitySuggestions(municipalityQuery.value)
}

function blurMunicipalityField(): void {
  window.setTimeout(() => {
    municipalityOpen.value = false
  }, 120)
}

function selectMunicipality(suggestion: DadataMunicipalitySuggestion): void {
  if (!editable.value) return
  editable.value.municipalityName = suggestion.value
  municipalityQuery.value = suggestion.value
  municipalitySuggestions.value = []
  municipalityOpen.value = false

  if (Number.isFinite(suggestion.geoLon) && Number.isFinite(suggestion.geoLat)) {
    editable.value.mapCenter = [suggestion.geoLon!, suggestion.geoLat!]
  }
}

function queueMunicipalitySuggestions(query: string): void {
  if (municipalityTimer) clearTimeout(municipalityTimer)
  municipalityAbortController?.abort()

  if (query.trim().length < 2) {
    municipalitySuggestions.value = []
    municipalityLoading.value = false
    return
  }

  municipalityLoading.value = true
  municipalityTimer = setTimeout(async () => {
    municipalityAbortController = new AbortController()
    try {
      municipalitySuggestions.value = await suggestRussianMunicipalities(query, municipalityAbortController.signal)
    } catch {
      municipalitySuggestions.value = []
    } finally {
      municipalityLoading.value = false
    }
  }, 240)
}

function formatDateTimePreview(date: Date, format: string): string {
  const monthLong = formatRussianMonthGenitive(date)
  const replacements: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    yy: String(date.getFullYear()).slice(-2),
    MMMM: monthLong,
    MM: padDatePart(date.getMonth() + 1),
    dd: padDatePart(date.getDate()),
    d: String(date.getDate()),
    HH: padDatePart(date.getHours()),
    mm: padDatePart(date.getMinutes()),
  }
  return format.replace(/yyyy|yy|MMMM|MM|dd|d|HH|mm/g, (token) => replacements[token] ?? token)
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

function formatRussianMonthGenitive(date: Date): string {
  const parts = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).formatToParts(date)
  return parts.find((part) => part.type === 'month')?.value ?? ''
}
</script>

<template>
  <div>
    <UiPageHeader title="Платформа" description="Системная конфигурация платформы и карты." />
    <form v-if="editable" class="panel form-grid" @submit.prevent="save">
      <div class="form-field"><label>Название платформы</label><UiInput v-model="editable.platformName" /></div>
      <div class="form-field">
        <label>Муниципалитет</label>
        <div class="municipality-combobox">
          <input
            class="municipality-combobox__input"
            :value="municipalityQuery"
            placeholder="Начните вводить город"
            autocomplete="off"
            @input="updateMunicipalityQuery"
            @focus="focusMunicipalityField"
            @blur="blurMunicipalityField"
          />
          <div v-if="municipalityOpen && (municipalitySuggestions.length > 0 || municipalityLoading)" class="municipality-combobox__menu">
            <div v-if="municipalityLoading" class="municipality-combobox__loading">Ищем город...</div>
            <button
              v-for="suggestion in municipalitySuggestions"
              :key="suggestion.unrestrictedValue"
              class="municipality-combobox__option"
              type="button"
              @mousedown.prevent="selectMunicipality(suggestion)"
            >
              <span>{{ suggestion.label }}</span>
              <small v-if="suggestion.region">{{ suggestion.region }}</small>
            </button>
          </div>
        </div>
      </div>
      <div class="form-field"><label>Долгота центра карты</label><InputNumber v-model="editable.mapCenter[0]" :min-fraction-digits="4" fluid /></div>
      <div class="form-field"><label>Широта центра карты</label><InputNumber v-model="editable.mapCenter[1]" :min-fraction-digits="4" fluid /></div>
      <div class="form-field"><label>Масштаб карты</label><InputNumber v-model="editable.mapZoom" fluid /></div>
      <div class="form-field"><label>Тайм-аут сессии</label><InputNumber v-model="editable.sessionTimeoutMinutes" suffix=" мин" fluid /></div>
      <div class="form-field">
        <label>Формат даты и времени</label>
        <UiSelect v-model="editable.dateTimeFormat" :options="dateTimeFormatOptions" />
      </div>
      <div class="form-field full inline-actions">
        <UiButton label="Сохранить" type="submit" icon="pi pi-save" />
        <UiButton label="Очистить данные" severity="secondary" variant="outlined" @click="resetDemo" />
      </div>
    </form>
  </div>
</template>

<style scoped>
.municipality-combobox {
  position: relative;
}

.municipality-combobox__input {
  width: 100%;
  min-height: 38px;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.municipality-combobox__input:focus {
  border-color: #bfdbfe;
  outline: none;
}

.municipality-combobox__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.16);
}

.municipality-combobox__option,
.municipality-combobox__loading {
  width: 100%;
  padding: 9px 10px;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
}

.municipality-combobox__option {
  display: grid;
  gap: 2px;
  cursor: pointer;
}

.municipality-combobox__option small,
.municipality-combobox__loading {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.municipality-combobox__option:hover,
.municipality-combobox__option:focus-visible {
  background: var(--color-accent-soft);
  outline: none;
}
</style>
