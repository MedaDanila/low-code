<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import UiButton from '../../shared/ui/UiButton.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import { usePlatformStore } from '../../stores/platform'
import EntityPropertyList from '../../widgets/entity/EntityPropertyList.vue'
import MapCanvas from '../../widgets/map/MapCanvas.vue'
import MapLayerPanel from '../../widgets/map/MapLayerPanel.vue'
import StatusBadge from '../../widgets/entity/StatusBadge.vue'
import type { EntityObject } from '../../shared/types/domain'

const router = useRouter()
const platform = usePlatformStore()
const visibleLayerIds = ref<string[]>([])
const selectedObject = ref<EntityObject | null>(null)

watch(
  () => platform.layers,
  (layers) => {
    if (visibleLayerIds.value.length === 0) visibleLayerIds.value = layers.filter((layer) => layer.visibleByDefault).map((layer) => layer.id)
  },
  { immediate: true },
)

const selectedSchema = computed(() => (selectedObject.value ? platform.schemaById(selectedObject.value.entityId) : undefined))

function toggleLayer(layerId: string) {
  visibleLayerIds.value = visibleLayerIds.value.includes(layerId)
    ? visibleLayerIds.value.filter((id) => id !== layerId)
    : [...visibleLayerIds.value, layerId]
}

async function updateOpacity(layerId: string, opacity: number) {
  const layer = platform.layers.find((item) => item.id === layerId)
  if (layer) await platform.saveLayer({ ...layer, opacity })
}

function openSelected() {
  if (!selectedObject.value || !selectedSchema.value) return
  router.push(`/app/entities/${selectedSchema.value.code}/${selectedObject.value.id}`)
}
</script>

<template>
  <div>
    <UiPageHeader title="Глобальная карта" description="Единая GIS-витрина опубликованных сущностей и слоёв.">
      <template #actions>
        <UiButton label="Select" icon="pi pi-crosshairs" severity="secondary" variant="outlined" />
        <UiButton label="Layers" icon="pi pi-list" severity="secondary" variant="outlined" />
      </template>
    </UiPageHeader>

    <section class="page-grid two">
      <div class="panel">
        <MapCanvas
          :layers="platform.layers"
          :schemas="platform.activeSchemas"
          :objects="platform.entityObjects"
          :visible-layer-ids="visibleLayerIds"
          :selected-object-id="selectedObject?.id"
          height="calc(100vh - 188px)"
          @select-object="selectedObject = $event"
        />
      </div>
      <aside class="stack">
        <section class="panel">
          <MapLayerPanel
            :layers="platform.layers"
            :visible-layer-ids="visibleLayerIds"
            @toggle="toggleLayer"
            @opacity="updateOpacity"
          />
        </section>
        <section v-if="selectedObject && selectedSchema" class="panel stack">
          <div class="inline-actions" style="justify-content: space-between">
            <h3 class="surface-title">{{ selectedSchema.name }}</h3>
            <StatusBadge :status="selectedObject.status" />
          </div>
          <EntityPropertyList :schema="selectedSchema" :object="selectedObject" />
          <UiButton label="Открыть карточку" icon="pi pi-arrow-right" @click="openSelected" />
        </section>
      </aside>
    </section>
  </div>
</template>
