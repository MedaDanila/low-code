<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import { formatDate, formatValue } from '../../shared/lib/format'
import { usePlatformStore } from '../../stores/platform'
import MapCanvas from '../../widgets/map/MapCanvas.vue'
import type { EntityField, EntityObject } from '../../shared/types/domain'

const router = useRouter()
const platform = usePlatformStore()
const visibleLayerIds = ref<string[]>([])
const selectedObject = ref<EntityObject | null>(null)
const layerFilterOpen = ref(false)
const hasPublishedEntities = computed(() => platform.activeSchemas.length > 0)
const hasMapObjects = computed(() => platform.entityObjects.some((object) => Boolean(object.geometry)))
const selectedLayerNames = computed(() =>
  platform.layers
    .filter((layer) => visibleLayerIds.value.includes(layer.id))
    .map((layer) => layer.name),
)
const layerFilterLabel = computed(() => selectedLayerNames.value.length > 0 ? selectedLayerNames.value.join(', ') : 'Слои не выбраны')

watch(
  () => platform.layers,
  (layers) => {
    if (visibleLayerIds.value.length === 0) visibleLayerIds.value = layers.filter((layer) => layer.visibleByDefault).map((layer) => layer.id)
  },
  { immediate: true },
)

const selectedSchema = computed(() => (selectedObject.value ? platform.schemaById(selectedObject.value.entityId) : undefined))
const selectedTitle = computed(() => {
  if (!selectedObject.value) return ''
  return String(
    selectedObject.value.values.name
    ?? selectedObject.value.values.title
    ?? selectedObject.value.values.number
    ?? selectedObject.value.values.address
    ?? selectedObject.value.id,
  )
})
const selectedRows = computed(() => {
  if (!selectedObject.value || !selectedSchema.value) return []
  return selectedSchema.value.fields
    .filter((field) => field.cardVisible)
    .sort((first, second) => first.order - second.order)
    .slice(0, 8)
    .map((field) => ({
      key: field.code,
      label: field.name,
      value: formattedFieldValue(selectedObject.value!, field),
    }))
    .filter((row) => row.value !== '—')
})

function toggleLayer(layerId: string) {
  visibleLayerIds.value = visibleLayerIds.value.includes(layerId)
    ? visibleLayerIds.value.filter((id) => id !== layerId)
    : [...visibleLayerIds.value, layerId]
}

function openSelected() {
  if (!selectedObject.value || !selectedSchema.value) return
  router.push(`/app/entities/${selectedSchema.value.code}/${selectedObject.value.id}`)
}

function formattedFieldValue(object: EntityObject, field: EntityField): string {
  const raw = object.values[field.code]
  const enumLabel = platform.dictionaryById(field.enumId)?.items.find((item) => item.code === raw)?.name
  return String(field.type === 'date' || field.type === 'datetime' ? formatDate(raw) : enumLabel ?? formatValue(raw))
}
</script>

<template>
  <div>
    <UiEmptyState
      v-if="!hasPublishedEntities"
      title="Карта пока пустая"
      description="Опубликуйте сущность с геометрией, чтобы на карте появились слои."
    >
      <UiButton label="Создать сущность" icon="pi pi-plus" @click="router.push('/admin/entities/new')" />
    </UiEmptyState>

    <UiEmptyState
      v-else-if="!hasMapObjects"
      title="На карте пока нет объектов"
      description="Создайте объект вручную или импортируйте таблицу с адресами, чтобы координаты появились автоматически."
    >
      <UiButton label="Импортировать данные" icon="pi pi-upload" @click="router.push('/admin/import')" />
    </UiEmptyState>

    <section v-else class="map-workspace">
      <MapCanvas
        :layers="platform.layers"
        :schemas="platform.activeSchemas"
        :objects="platform.entityObjects"
        :visible-layer-ids="visibleLayerIds"
        :selected-object-id="selectedObject?.id"
        height="calc(100vh - 72px)"
        @select-object="selectedObject = $event"
      />

      <div class="map-layer-filter" @click.stop>
        <button class="map-layer-filter__trigger" type="button" @click="layerFilterOpen = !layerFilterOpen">
          <span>{{ layerFilterLabel }}</span>
          <i aria-hidden="true">⌄</i>
        </button>
        <div v-if="layerFilterOpen" class="map-layer-filter__menu">
          <p v-if="platform.layers.length === 0">Слои появятся после публикации сущностей.</p>
          <label v-for="layer in platform.layers" :key="layer.id" class="map-layer-filter__item">
            <input
              type="checkbox"
              :checked="visibleLayerIds.includes(layer.id)"
              @change="toggleLayer(layer.id)"
            >
            <span>{{ layer.name }}</span>
          </label>
        </div>
      </div>

      <aside v-if="selectedObject && selectedSchema" class="map-object-tooltip">
        <div class="map-object-tooltip__header">
          <span>{{ selectedSchema.name }}</span>
          <button type="button" aria-label="Закрыть карточку объекта" @click="selectedObject = null">×</button>
        </div>
        <strong>{{ selectedTitle }}</strong>
        <dl>
          <div v-for="row in selectedRows" :key="row.key">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
        <UiButton
          class="map-object-tooltip__open"
          label="Открыть карточку"
          icon="pi pi-arrow-right"
          severity="secondary"
          variant="outlined"
          @click="openSelected"
        />
      </aside>
    </section>
  </div>
</template>

<style scoped>
.map-workspace {
  position: relative;
  min-width: 0;
}

.map-workspace :deep(.map-canvas) {
  border: 0;
  border-radius: 0;
}

.map-workspace :deep(.ol-zoom) {
  top: 50%;
  right: 14px;
  left: auto;
  display: grid;
  gap: 8px;
  padding: 0;
  background: transparent;
  transform: translateY(-50%);
}

.map-workspace :deep(.ol-zoom button) {
  width: 38px;
  height: 38px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.94);
  color: var(--color-text);
  font-size: 22px;
  font-weight: 700;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.14);
  cursor: pointer;
  backdrop-filter: blur(12px);
}

.map-workspace :deep(.ol-zoom button:hover),
.map-workspace :deep(.ol-zoom button:focus-visible) {
  background: var(--color-accent-soft);
  outline: none;
}

.map-layer-filter,
.map-object-tooltip {
  position: absolute;
  z-index: 20;
}

.map-layer-filter {
  top: 14px;
  left: 14px;
  width: min(300px, calc(100% - 28px));
}

.map-layer-filter__trigger {
  width: 100%;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.94);
  color: var(--color-text);
  font: inherit;
  font-weight: 700;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.12);
  cursor: pointer;
  backdrop-filter: blur(12px);
}

.map-layer-filter__trigger:focus-visible {
  border-color: #93c5fd;
  outline: none;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14), 0 14px 34px rgba(15, 23, 42, 0.12);
}

.map-layer-filter__trigger i {
  color: var(--color-text-secondary);
  font-style: normal;
}

.map-layer-filter__trigger span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-layer-filter__menu {
  display: grid;
  gap: 4px;
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(14px);
}

.map-layer-filter__menu p {
  margin: 4px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.map-layer-filter__item {
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.map-layer-filter__item:hover {
  background: var(--color-accent-soft);
}

.map-object-tooltip {
  top: 14px;
  right: 14px;
  width: min(340px, calc(100% - 28px));
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(14px);
}

.map-object-tooltip__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.map-object-tooltip__header button {
  width: 26px;
  height: 26px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.map-object-tooltip strong {
  color: var(--color-text);
  font-size: 15px;
  line-height: 1.25;
}

.map-object-tooltip dl {
  display: grid;
  gap: 7px;
  margin: 0;
}

.map-object-tooltip dl div {
  display: grid;
  grid-template-columns: minmax(96px, 0.8fr) minmax(0, 1.2fr);
  gap: 10px;
  align-items: start;
}

.map-object-tooltip dt {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.25;
}

.map-object-tooltip dd {
  margin: 0;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
  word-break: break-word;
}

.map-object-tooltip__open {
  justify-content: space-between;
  flex-direction: row-reverse;
}

@media (max-width: 760px) {
  .map-object-tooltip {
    top: auto;
    right: 10px;
    bottom: 10px;
    left: 10px;
    width: auto;
  }

  .map-layer-filter {
    top: 10px;
    left: 10px;
  }
}
</style>
