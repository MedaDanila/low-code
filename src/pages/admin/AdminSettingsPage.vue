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
  toast.add({ severity: 'info', summary: 'Demo data восстановлены', life: 2200 })
}
</script>

<template>
  <div>
    <UiPageHeader title="Настройки" description="Базовая конфигурация платформы и карты." />
    <form v-if="editable" class="panel form-grid" @submit.prevent="save">
      <div class="form-field"><label>Platform name</label><UiInput v-model="editable.platformName" /></div>
      <div class="form-field"><label>Municipality name</label><UiInput v-model="editable.municipalityName" /></div>
      <div class="form-field"><label>Map center longitude</label><InputNumber v-model="editable.mapCenter[0]" :min-fraction-digits="4" fluid /></div>
      <div class="form-field"><label>Map center latitude</label><InputNumber v-model="editable.mapCenter[1]" :min-fraction-digits="4" fluid /></div>
      <div class="form-field"><label>Map zoom</label><InputNumber v-model="editable.mapZoom" fluid /></div>
      <div class="form-field"><label>Session timeout</label><InputNumber v-model="editable.sessionTimeoutMinutes" suffix=" мин" fluid /></div>
      <div class="form-field"><label>Date/time format</label><UiInput v-model="editable.dateTimeFormat" /></div>
      <div class="form-field full inline-actions">
        <UiButton label="Сохранить" type="submit" icon="pi pi-save" />
        <UiButton label="Reset demo data" severity="secondary" variant="outlined" @click="resetDemo" />
      </div>
    </form>
  </div>
</template>
