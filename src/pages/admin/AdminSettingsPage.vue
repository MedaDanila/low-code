<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import InputNumber from 'primevue/inputnumber'
import UiButton from '../../shared/ui/UiButton.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import { usePlatformStore } from '../../stores/platform'
import type { PlatformSettings } from '../../shared/types/domain'

const toast = useToast()
const platform = usePlatformStore()
const editable = ref<PlatformSettings | null>(null)

watch(
  () => platform.settings,
  (settings) => {
    editable.value = settings ? JSON.parse(JSON.stringify(settings)) as PlatformSettings : null
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
</script>

<template>
  <div>
    <UiPageHeader title="Платформа" description="Системная конфигурация платформы и карты." />
    <form v-if="editable" class="panel form-grid" @submit.prevent="save">
      <div class="form-field"><label>Название платформы</label><UiInput v-model="editable.platformName" /></div>
      <div class="form-field"><label>Муниципалитет</label><UiInput v-model="editable.municipalityName" /></div>
      <div class="form-field"><label>Долгота центра карты</label><InputNumber v-model="editable.mapCenter[0]" :min-fraction-digits="4" fluid /></div>
      <div class="form-field"><label>Широта центра карты</label><InputNumber v-model="editable.mapCenter[1]" :min-fraction-digits="4" fluid /></div>
      <div class="form-field"><label>Масштаб карты</label><InputNumber v-model="editable.mapZoom" fluid /></div>
      <div class="form-field"><label>Тайм-аут сессии</label><InputNumber v-model="editable.sessionTimeoutMinutes" suffix=" мин" fluid /></div>
      <div class="form-field"><label>Формат даты и времени</label><UiInput v-model="editable.dateTimeFormat" /></div>
      <div class="form-field full inline-actions">
        <UiButton label="Сохранить" type="submit" icon="pi pi-save" />
        <UiButton label="Очистить данные" severity="secondary" variant="outlined" @click="resetDemo" />
      </div>
    </form>
  </div>
</template>
