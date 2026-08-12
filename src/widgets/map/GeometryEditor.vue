<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Maximize2, MousePointer2, PencilLine, Trash2 } from '@lucide/vue'
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
import { fromLonLat } from 'ol/proj'
import type Geometry from 'ol/geom/Geometry'
import { MAP_CONFIG } from '../../shared/config/map'
import { geometryLengthMeters, polygonAreaSqMeters } from '../../shared/lib/geometry'
import type { DomainGeometry, GeometryType } from '../../shared/types/domain'
import { domainToFeature, olToDomainGeometry } from './olGeometry'

const props = withDefaults(
  defineProps<{
    geometryType: GeometryType
    modelValue?: DomainGeometry
    height?: string
    conflictGeometries?: DomainGeometry[]
  }>(),
  {
    height: '360px',
    conflictGeometries: () => [],
  },
)

const emit = defineEmits<{
  'update:modelValue': [geometry: DomainGeometry | undefined]
  validate: []
}>()

const mapEl = ref<HTMLElement | null>(null)
let map: Map | null = null
let draw: Draw | null = null
let modify: Modify | null = null

const source = new VectorSource<Feature<Geometry>>()
const conflictSource = new VectorSource<Feature<Geometry>>()
const activeTool = ref<'select' | 'draw' | 'modify'>('select')

const drawType = computed(() => {
  if (props.geometryType === 'point') return 'Point'
  if (props.geometryType === 'lineString') return 'LineString'
  if (props.geometryType === 'polygon') return 'Polygon'
  return null
})

const area = computed(() => polygonAreaSqMeters(props.modelValue))
const perimeter = computed(() => geometryLengthMeters(props.modelValue))

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
      center: fromLonLat(MAP_CONFIG.defaultCenter),
      zoom: MAP_CONFIG.defaultZoom,
    }),
  })
  modify = new Modify({ source })
  modify.on('modifyend', emitCurrentGeometry)
  map.addInteraction(modify)
  setModifyActive(false)
  syncGeometry()
  syncConflicts()
})

onBeforeUnmount(() => {
  map?.setTarget(undefined)
  map = null
})

watch(() => props.modelValue, syncGeometry, { deep: true })
watch(() => props.conflictGeometries, syncConflicts, { deep: true })

function startDraw() {
  if (!map || !drawType.value) return
  stopDraw()
  activeTool.value = 'draw'
  setModifyActive(false)
  draw = new Draw({ source, type: drawType.value })
  draw.on('drawstart', () => source.clear())
  draw.on('drawend', (event) => {
    window.setTimeout(() => emitGeometry(event.feature), 0)
    activeTool.value = 'select'
    stopDraw()
  })
  map.addInteraction(draw)
}

function startModify() {
  activeTool.value = 'modify'
  stopDraw()
  setModifyActive(true)
}

function selectTool() {
  activeTool.value = 'select'
  stopDraw()
  setModifyActive(false)
}

function clearGeometry() {
  source.clear()
  emit('update:modelValue', undefined)
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
  emit('update:modelValue', olToDomainGeometry(feature?.getGeometry()))
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
    <div class="map-toolbar">
      <button type="button" :class="{ active: activeTool === 'select' }" @click="selectTool">
        <MousePointer2 :size="15" />
        Select
      </button>
      <button v-if="drawType" type="button" :class="{ active: activeTool === 'draw' }" @click="startDraw">
        <PencilLine :size="15" />
        {{ geometryType === 'point' ? 'Point' : geometryType === 'lineString' ? 'Line' : 'Polygon' }}
      </button>
      <button type="button" :class="{ active: activeTool === 'modify' }" @click="startModify">
        <PencilLine :size="15" />
        Modify
      </button>
      <button type="button" @click="clearGeometry">
        <Trash2 :size="15" />
        Delete
      </button>
      <button type="button" @click="fitGeometry">
        <Maximize2 :size="15" />
        Fit
      </button>
      <button v-if="geometryType !== 'none'" type="button" class="primary" @click="emit('validate')">
        Проверить территорию
      </button>
    </div>
    <div ref="mapEl" class="geometry-editor__map" :style="{ height }" />
    <div v-if="geometryType === 'polygon'" class="geometry-editor__metrics">
      <span>Площадь: {{ Math.round(area).toLocaleString('ru-RU') }} м²</span>
      <span>Периметр: {{ Math.round(perimeter).toLocaleString('ru-RU') }} м</span>
    </div>
  </div>
</template>

<style scoped>
.geometry-editor {
  display: grid;
  gap: 10px;
}

.geometry-editor__map {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: #eef2f7;
}

.map-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.map-toolbar button {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.map-toolbar button.active,
.map-toolbar button:hover {
  border-color: #bfdbfe;
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.map-toolbar button.primary {
  margin-left: auto;
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: #ffffff;
}

.geometry-editor__metrics {
  display: flex;
  gap: 12px;
  color: var(--color-text-secondary);
  font-size: 12px;
}
</style>
