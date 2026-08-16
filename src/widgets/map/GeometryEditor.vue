<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LocateFixed, Maximize2, MousePointer2, PencilLine, Trash2 } from '@lucide/vue'
import Select from 'primevue/select'
import Draw from 'ol/interaction/Draw'
import Feature from 'ol/Feature'
import Map from 'ol/Map'
import Modify from 'ol/interaction/Modify'
import OSM from 'ol/source/OSM'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import View from 'ol/View'
import { Fill, Stroke, Style } from 'ol/style'
import CircleStyle from 'ol/style/Circle'
import { boundingExtent } from 'ol/extent'
import { fromLonLat, toLonLat } from 'ol/proj'
import type Geometry from 'ol/geom/Geometry'
import type MapBrowserEvent from 'ol/MapBrowserEvent'
import { geocodeAddress } from '../../shared/api/dadata'
import { findBuildingGeometryByCoordinates } from '../../shared/api/nominatim'
import { MAP_CONFIG } from '../../shared/config/map'
import { geometryCenter, geometryLengthMeters, polygonAreaSqMeters } from '../../shared/lib/geometry'
import { usePlatformStore } from '../../stores/platform'
import type { Coordinates, DomainGeometry, GeometryType, MapGeometryType } from '../../shared/types/domain'
import { domainToFeature, olToDomainGeometry } from './olGeometry'

const props = withDefaults(
  defineProps<{
    geometryType: GeometryType
    modelValue?: DomainGeometry
    height?: string
    enabledGeometryTypes?: MapGeometryType[]
    conflictGeometries?: DomainGeometry[]
    fallbackAddress?: string
  }>(),
  {
    height: '360px',
    enabledGeometryTypes: () => [],
    conflictGeometries: () => [],
    fallbackAddress: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [geometry: DomainGeometry | undefined]
}>()

const platform = usePlatformStore()
const mapEl = ref<HTMLElement | null>(null)
let map: Map | null = null
let draw: Draw | null = null
let modify: Modify | null = null

const source = new VectorSource<Feature<Geometry>>()
const conflictSource = new VectorSource<Feature<Geometry>>()
const activeTool = ref<'select' | 'draw' | 'modify' | 'pick-building'>('select')
const activeDrawType = ref<MapGeometryType | null>(null)
const buildingStatus = ref('')
const geometryLoading = ref(false)
const geometryError = ref('')
let geometryAbortController: AbortController | null = null

const geometryOptions: Array<{ value: MapGeometryType; label: string }> = [
  { value: 'point', label: 'Точка' },
  { value: 'lineString', label: 'Линия' },
  { value: 'polygon', label: 'Полигон' },
]

const allowedGeometryTypes = computed<MapGeometryType[]>(() => {
  if (props.enabledGeometryTypes.length > 0) return props.enabledGeometryTypes
  return props.geometryType !== 'none' ? [props.geometryType] : []
})
const drawControls = computed(() =>
  geometryOptions.filter((option) => allowedGeometryTypes.value.includes(option.value)),
)
const drawModelValue = computed(() => (activeTool.value === 'draw' ? activeDrawType.value : null))
const area = computed(() => polygonAreaSqMeters(props.modelValue))
const perimeter = computed(() => geometryLengthMeters(props.modelValue))
const canDetermineGeometry = computed(() =>
  Boolean(props.fallbackAddress.trim()) && !geometryLoading.value,
)
const canPickBuilding = computed(() => allowedGeometryTypes.value.includes('polygon') && !geometryLoading.value)

onMounted(() => {
  map = new Map({
    target: mapEl.value ?? undefined,
    layers: [
      new TileLayer({ source: new OSM({ url: MAP_CONFIG.tileUrl }) }),
      new VectorLayer({
        source: conflictSource,
        style: new Style({
          fill: new Fill({ color: 'rgba(217, 45, 32, 0.22)' }),
          stroke: new Stroke({ color: '#d92d20', width: 3 }),
        }),
      }),
      new VectorLayer({
        source,
        style: new Style({
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: '#2563eb' }),
            stroke: new Stroke({ color: '#ffffff', width: 2 }),
          }),
          fill: new Fill({ color: 'rgba(37, 99, 235, 0.18)' }),
          stroke: new Stroke({ color: '#2563eb', width: 3 }),
        }),
      }),
    ],
    view: new View({
      center: fromLonLat(platform.settings?.mapCenter ?? MAP_CONFIG.defaultCenter),
      zoom: platform.settings?.mapZoom ?? MAP_CONFIG.defaultZoom,
    }),
  })
  map.on('singleclick', (event) => {
    void handleMapClick(event as MapBrowserEvent<PointerEvent>)
  })
  modify = new Modify({ source })
  modify.on('modifyend', emitCurrentGeometry)
  map.addInteraction(modify)
  setModifyActive(false)
  syncGeometry()
  syncConflicts()
})

onBeforeUnmount(() => {
  geometryAbortController?.abort()
  map?.setTarget(undefined)
  map = null
})

watch(() => props.modelValue, syncGeometry, { deep: true })
watch(() => props.conflictGeometries, syncConflicts, { deep: true })

function startDraw(type: MapGeometryType) {
  if (!map || !allowedGeometryTypes.value.includes(type)) return
  stopDraw()
  resetLookupState()
  activeDrawType.value = type
  activeTool.value = 'draw'
  setModifyActive(false)
  draw = new Draw({ source, type: toOlDrawType(type) })
  draw.on('drawstart', () => source.clear())
  draw.on('drawend', (event) => {
    window.setTimeout(() => emitGeometry(event.feature), 0)
    activeTool.value = 'select'
    activeDrawType.value = null
    stopDraw()
  })
  map.addInteraction(draw)
}

function handleDrawSelect(value: MapGeometryType | null) {
  if (!value) return
  startDraw(value)
}

function drawValueLabel(value: unknown): string | null {
  return drawControls.value.find((option) => option.value === value)?.label ?? null
}

function startModify() {
  activeTool.value = 'modify'
  activeDrawType.value = null
  buildingStatus.value = ''
  stopDraw()
  setModifyActive(true)
}

function startPickBuilding() {
  if (!canPickBuilding.value) return
  activeTool.value = 'pick-building'
  activeDrawType.value = null
  stopDraw()
  setModifyActive(false)
  buildingStatus.value = 'Кликните по зданию на карте, чтобы взять его контур из Nominatim.'
  geometryError.value = ''
}

function selectTool() {
  activeTool.value = 'select'
  activeDrawType.value = null
  stopDraw()
  setModifyActive(false)
}

function clearGeometry() {
  resetLookupState()
  setCurrentGeometry(undefined)
}

function fitGeometry() {
  if (!map) return
  const features = [...source.getFeatures(), ...conflictSource.getFeatures()]
  if (features.length === 0) return
  const coordinates = features.flatMap((feature) => {
    const extent = feature.getGeometry()?.getExtent()
    return extent ? [[extent[0], extent[1]], [extent[2], extent[3]]] : []
  })
  map.getView().fit(boundingExtent(coordinates), { padding: [48, 48, 48, 48], maxZoom: 16, duration: 220 })
}

function syncGeometry() {
  source.clear()
  if (props.modelValue) {
    source.addFeature(domainToFeature(props.modelValue))
    requestAnimationFrame(fitGeometry)
  }
}

function syncConflicts() {
  conflictSource.clear()
  props.conflictGeometries.forEach((geometry) => conflictSource.addFeature(domainToFeature(geometry)))
}

function emitCurrentGeometry() {
  emitGeometry(source.getFeatures()[0])
}

function emitGeometry(feature?: Feature<Geometry>) {
  buildingStatus.value = ''
  geometryError.value = ''
  emit('update:modelValue', olToDomainGeometry(feature?.getGeometry()))
}

async function handleMapClick(event: MapBrowserEvent<PointerEvent>): Promise<void> {
  if (activeTool.value !== 'pick-building' || geometryLoading.value) return
  const [lon, lat] = toLonLat(event.coordinate)
  await determineBuildingGeometry([Number(lon.toFixed(6)), Number(lat.toFixed(6))], undefined, true)
}

async function determineAddressGeometry() {
  resetLookupState()
  geometryAbortController?.abort()
  geometryAbortController = new AbortController()
  geometryLoading.value = true

  try {
    const coordinates = await resolveCoordinates(geometryAbortController.signal)
    if (!coordinates) {
      geometryError.value = 'Нужны координаты адреса. Укажите адрес или поставьте точку на карте.'
      return
    }

    await determineBuildingGeometry(coordinates, geometryAbortController.signal)
  } catch (cause) {
    if ((cause as DOMException).name === 'AbortError') return
    geometryError.value = cause instanceof Error ? cause.message : 'Не удалось определить геометрию'
  } finally {
    geometryLoading.value = false
  }
}

async function determineBuildingGeometry(
  coordinates: Coordinates,
  signal?: AbortSignal,
  fromMapClick = false,
): Promise<void> {
  if (!signal) {
    geometryAbortController?.abort()
    geometryAbortController = new AbortController()
    signal = geometryAbortController.signal
  }
  geometryLoading.value = true
  geometryError.value = ''
  try {
    const building = await findBuildingGeometryByCoordinates(coordinates, signal)
    if (!building) {
      buildingStatus.value = fromMapClick
        ? 'Здание в этой точке не найдено. Кликните ближе к контуру дома.'
        : fallbackPointAllowed()
        ? 'Здание не найдено, сохранена точка адреса.'
        : 'Здание не найдено. Точка не сохранена, потому что тип «Точка» выключен в настройках сущности.'
      return
    }

    if (!isGeometryAllowed(building.geometry)) {
      buildingStatus.value = 'Контур здания найден, но тип «Полигон» выключен в настройках сущности.'
      return
    }

    buildingStatus.value = `Контур здания найден: ${building.name}`
    setCurrentGeometry(building.geometry)
    if (fromMapClick) activeTool.value = 'select'
  } catch (cause) {
    if ((cause as DOMException).name === 'AbortError') throw cause
    buildingStatus.value = fromMapClick
      ? 'Nominatim недоступен, контур здания не выбран.'
      : fallbackPointAllowed()
        ? 'Nominatim недоступен, сохранена точка адреса.'
        : 'Nominatim недоступен, геометрия не изменена.'
  } finally {
    geometryLoading.value = false
  }
}

async function resolveCoordinates(signal: AbortSignal): Promise<Coordinates | null> {
  const address = props.fallbackAddress.trim()
  if (address) {
    const suggestion = await geocodeAddress(address, signal)
    const geoLon = suggestion?.geoLon
    const geoLat = suggestion?.geoLat
    if (Number.isFinite(geoLon) && Number.isFinite(geoLat)) {
      const geometry: DomainGeometry = {
        type: 'Point',
        coordinates: [geoLon!, geoLat!],
      }
      if (isGeometryAllowed(geometry)) setCurrentGeometry(geometry)
      return geometry.coordinates
    }
  }

  return props.modelValue ? geometryCenter(props.modelValue) : null
}

function resetLookupState(): void {
  buildingStatus.value = ''
  geometryError.value = ''
}

function setCurrentGeometry(geometry: DomainGeometry | undefined): void {
  source.clear()
  if (geometry) {
    source.addFeature(domainToFeature(geometry))
    requestAnimationFrame(fitGeometry)
  }
  emit('update:modelValue', geometry)
}

function toOlDrawType(type: MapGeometryType): 'Point' | 'LineString' | 'Polygon' {
  if (type === 'point') return 'Point'
  if (type === 'lineString') return 'LineString'
  return 'Polygon'
}

function domainGeometryType(geometry: DomainGeometry): MapGeometryType {
  if (geometry.type === 'Point') return 'point'
  if (geometry.type === 'LineString') return 'lineString'
  return 'polygon'
}

function isGeometryAllowed(geometry: DomainGeometry): boolean {
  return allowedGeometryTypes.value.includes(domainGeometryType(geometry))
}

function fallbackPointAllowed(): boolean {
  return allowedGeometryTypes.value.includes('point')
}

function stopDraw() {
  if (draw && map) map.removeInteraction(draw)
  draw = null
}

function setModifyActive(active: boolean) {
  modify?.setActive(active)
}
</script>

<template>
  <div class="geometry-editor">
    <div class="geometry-editor__stage" :class="{ 'geometry-editor__stage--picking': activeTool === 'pick-building' }" :style="{ height }">
      <div ref="mapEl" class="geometry-editor__map" />

      <div class="geometry-editor__controls geometry-editor__controls--left">
        <div class="map-toolbar">
          <button type="button" :class="{ active: activeTool === 'select' }" @click="selectTool">
            <MousePointer2 :size="15" />
            Выбрать
          </button>
          <Select
            v-if="drawControls.length > 0"
            class="map-toolbar__draw-select"
            :class="{ 'map-toolbar__draw-select--active': activeTool === 'draw' }"
            :model-value="drawModelValue"
            :options="drawControls"
            option-label="label"
            option-value="value"
            placeholder="Рисовать"
            append-to="self"
            aria-label="Рисовать геометрию"
            @update:model-value="handleDrawSelect"
          >
            <template #value="{ value, placeholder }">
              <span class="map-toolbar__draw-value">
                <PencilLine :size="15" />
                <span>{{ drawValueLabel(value) ?? placeholder }}</span>
              </span>
            </template>
          </Select>
          <button type="button" :class="{ active: activeTool === 'modify' }" @click="startModify">
            <PencilLine :size="15" />
            Изменить
          </button>
        </div>
      </div>

      <div class="geometry-editor__controls geometry-editor__controls--right">
        <div class="map-toolbar map-toolbar--stack">
          <button
            v-if="allowedGeometryTypes.length > 0"
            type="button"
            class="primary"
            title="Определить геометрию по адресу из карточки"
            :disabled="!canDetermineGeometry"
            @click="determineAddressGeometry"
          >
            <LocateFixed :size="15" />
            {{ geometryLoading ? 'Определяем...' : 'По адресу' }}
          </button>
          <button
            type="button"
            :class="{ active: activeTool === 'pick-building' }"
            title="Кликнуть по дому на карте и выбрать его контур"
            :disabled="!canPickBuilding"
            @click="startPickBuilding"
          >
            <LocateFixed :size="15" />
            Дом на карте
          </button>
          <button type="button" title="Показать геометрию" @click="fitGeometry">
            <Maximize2 :size="15" />
            Показать
          </button>
          <button type="button" title="Удалить геометрию" @click="clearGeometry">
            <Trash2 :size="15" />
            Удалить
          </button>
        </div>
      </div>

      <div v-if="allowedGeometryTypes.includes('polygon') || modelValue?.type === 'Polygon'" class="geometry-editor__metrics">
        <span>Площадь: {{ Math.round(area).toLocaleString('ru-RU') }} м²</span>
        <span>Периметр: {{ Math.round(perimeter).toLocaleString('ru-RU') }} м</span>
      </div>

      <section v-if="buildingStatus || geometryError" class="geometry-lookup-panel">
        <strong>Геометрия по адресу</strong>
        <p v-if="buildingStatus" class="geometry-lookup-panel__status">{{ buildingStatus }}</p>
        <p v-if="geometryError" class="geometry-lookup-panel__error">{{ geometryError }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.geometry-editor {
  display: grid;
  gap: 10px;
}

.geometry-editor__stage {
  position: relative;
  min-height: 420px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: #eef2f7;
}

.geometry-editor__map {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.geometry-editor__stage--picking .geometry-editor__map {
  cursor: crosshair;
}

.geometry-editor__controls {
  position: absolute;
  top: 8px;
  z-index: 5;
  max-width: min(560px, calc(100% - 16px));
}

.geometry-editor__controls--left {
  left: 8px;
}

.geometry-editor__controls--right {
  right: 8px;
}

.map-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding: 4px;
  border: 1px solid rgba(208, 213, 221, 0.86);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.11);
  backdrop-filter: blur(14px);
}

.map-toolbar--stack {
  width: 172px;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-end;
}

.map-toolbar--stack button {
  width: 100%;
  justify-content: flex-start;
}

.map-toolbar button,
.map-toolbar__draw-select {
  height: fit-content;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.96);
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.1;
  cursor: pointer;
}

.map-toolbar button.active,
.map-toolbar button:hover,
.map-toolbar__draw-select--active,
.map-toolbar__draw-select:hover {
  border-color: #bfdbfe;
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.map-toolbar__draw-select {
  width: 110px;
  min-width: 110px;
  max-width: 110px;
  gap: 0;
  padding: 0;
  box-shadow: none;
}

.map-toolbar__draw-select :deep(.p-select-label) {
  min-width: 0;
  padding: 0 0 0 7px;
  overflow: hidden;
  color: inherit;
  font: inherit;
  line-height: 1.1;
}

.map-toolbar__draw-select :deep(.p-select-dropdown) {
  width: 20px;
  color: inherit;
}

.map-toolbar__draw-select :deep(.p-select-dropdown-icon) {
  width: 14px;
  height: 14px;
}

.map-toolbar__draw-select :deep(.p-select-overlay) {
  min-width: 108px;
  border: 1px solid rgba(208, 213, 221, 0.9);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
  overflow: hidden;
}

.map-toolbar__draw-select :deep(.p-select-list) {
  padding: 3px;
}

.map-toolbar__draw-select :deep(.p-select-option) {
  min-height: 28px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 12px;
}

.map-toolbar__draw-select :deep(.p-select-option.p-select-option-selected) {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.map-toolbar__draw-value {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.map-toolbar__draw-value span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-toolbar__draw-value svg {
  flex: 0 0 auto;
}

.map-toolbar__draw-select:focus-within {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.map-toolbar button.primary {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: #ffffff;
}

.map-toolbar button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.geometry-editor__metrics {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 5;
  display: flex;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid rgba(208, 213, 221, 0.86);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text-secondary);
  font-size: 12px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.1);
  backdrop-filter: blur(14px);
}

.geometry-lookup-panel {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 5;
  max-width: min(520px, calc(100% - 24px));
  display: grid;
  gap: 5px;
  padding: 12px;
  border: 1px solid rgba(208, 213, 221, 0.86);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(14px);
}

.geometry-lookup-panel__error {
  margin: 0;
  color: var(--color-danger);
}

.geometry-lookup-panel__status {
  margin: 0;
  color: var(--color-text-secondary);
}
</style>
