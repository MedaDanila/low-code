<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Slider from 'primevue/slider'
import Checkbox from 'primevue/checkbox'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { usePlatformStore } from '../../stores/platform'
import type { Layer } from '../../shared/types/domain'

const toast = useToast()
const platform = usePlatformStore()
const selectedId = ref('')
const editable = ref<Layer | null>(null)

watch(
  () => platform.layers,
  () => {
    if (!selectedId.value) selectedId.value = platform.layers[0]?.id ?? ''
    const source = platform.layers.find((layer) => layer.id === selectedId.value)
    editable.value = source ? JSON.parse(JSON.stringify(source)) as Layer : null
  },
  { immediate: true, deep: true },
)

const rows = computed<Record<string, unknown>[]>(() =>
  platform.layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    source: platform.schemaById(layer.entityId)?.name ?? layer.entityId,
    geometry: layer.geometryType,
    visible: layer.visibleByDefault,
    selectable: layer.selectable,
  })),
)

const entityOptions = computed(() => platform.activeSchemas.map((schema) => ({ label: schema.name, value: schema.id })))

function select(row: Record<string, unknown>) {
  selectedId.value = String(row.id)
  const source = platform.layers.find((layer) => layer.id === selectedId.value)
  editable.value = source ? JSON.parse(JSON.stringify(source)) as Layer : null
}

async function save() {
  if (!editable.value) return
  await platform.saveLayer(editable.value)
  toast.add({ severity: 'success', summary: 'Слой сохранён', life: 2200 })
}
</script>

<template>
  <div>
    <UiPageHeader title="Слои" description="Настройки отображения entity-backed GIS layers." />
    <section class="split-layout">
      <div class="panel">
        <UiTable
          :rows="rows"
          :columns="[
            { field: 'name', header: 'Название' },
            { field: 'source', header: 'Source' },
            { field: 'geometry', header: 'Geometry' },
            { field: 'visible', header: 'Visible by default' },
            { field: 'selectable', header: 'Selectable' },
          ]"
          @row-click="select"
        />
      </div>
      <aside v-if="editable" class="panel stack">
        <div class="form-field">
          <label>Название</label>
          <UiInput v-model="editable.name" />
        </div>
        <div class="form-field">
          <label>Entity source</label>
          <UiSelect v-model="editable.entityId" :options="entityOptions" />
        </div>
        <label><Checkbox v-model="editable.visibleByDefault" binary /> Default visibility</label>
        <label><Checkbox v-model="editable.selectable" binary /> Selectable</label>
        <div class="form-field">
          <label>Opacity: {{ Math.round(editable.opacity * 100) }}%</label>
          <Slider :model-value="Math.round(editable.opacity * 100)" @update:model-value="editable.opacity = Number($event) / 100" />
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label>Fill</label>
            <input v-model="editable.style.fill" type="color" />
          </div>
          <div class="form-field">
            <label>Stroke</label>
            <input v-model="editable.style.stroke" type="color" />
          </div>
          <div class="form-field">
            <label>Stroke width</label>
            <input v-model.number="editable.style.strokeWidth" type="number" min="1" />
          </div>
          <div class="form-field">
            <label>Point size</label>
            <input v-model.number="editable.style.pointSize" type="number" min="4" />
          </div>
        </div>
        <UiButton label="Сохранить" icon="pi pi-save" @click="save" />
      </aside>
    </section>
  </div>
</template>
