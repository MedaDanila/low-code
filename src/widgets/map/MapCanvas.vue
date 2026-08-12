<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import Feature from 'ol/Feature'
import Map from 'ol/Map'
import OSM from 'ol/source/OSM'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import View from 'ol/View'
import { Fill, Stroke, Style } from 'ol/style'
import CircleStyle from 'ol/style/Circle'
import { fromLonLat } from 'ol/proj'
import type { FeatureLike } from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import { MAP_CONFIG } from '../../shared/config/map'
import type { EntityObject, EntitySchema, Layer } from '../../shared/types/domain'
import { domainToFeature } from './olGeometry'

const props = withDefaults(
  defineProps<{
    layers: Layer[]
    schemas: EntitySchema[]
    objects: EntityObject[]
    visibleLayerIds: string[]
    selectedObjectId?: string
    height?: string
  }>(),
  {
    selectedObjectId: '',
    height: '520px',
  },
)

const emit = defineEmits<{
  selectObject: [object: EntityObject]
}>()

let map: Map | null = null
const source = new VectorSource<Feature<Geometry>>()
const mapId = `map-${Math.random().toString(36).slice(2)}`

onMounted(() => {
  map = new Map({
    target: mapId,
    layers: [
      new TileLayer({ source: new OSM({ url: MAP_CONFIG.tileUrl }) }),
      new VectorLayer({ source, style: styleFeature }),
    ],
    view: new View({
      center: fromLonLat(MAP_CONFIG.defaultCenter),
      zoom: MAP_CONFIG.defaultZoom,
    }),
  })
  map.on('singleclick', (event) => {
    let selected: EntityObject | undefined
    map?.forEachFeatureAtPixel(event.pixel, (feature) => {
      const objectId = feature.get('objectId') as string | undefined
      selected = props.objects.find((object) => object.id === objectId)
      return true
    })
    if (selected) emit('selectObject', selected)
  })
  renderFeatures()
})

onBeforeUnmount(() => {
  map?.setTarget(undefined)
  map = null
})

watch(
  () => [props.objects, props.layers, props.visibleLayerIds, props.selectedObjectId],
  renderFeatures,
  { deep: true },
)

function renderFeatures() {
  source.clear()
  const visible = new Set(props.visibleLayerIds)
  props.objects.forEach((object) => {
    if (!object.geometry) return
    const layer = props.layers.find((item) => item.entityId === object.entityId)
    if (!layer || !visible.has(layer.id)) return
    const feature = domainToFeature(object.geometry)
    feature.set('objectId', object.id)
    feature.set('layerId', layer.id)
    source.addFeature(feature)
  })
}

function styleFeature(feature: FeatureLike): Style {
  const layer = props.layers.find((item) => item.id === feature.get('layerId'))
  const objectId = feature.get('objectId') as string | undefined
  const selected = objectId === props.selectedObjectId
  const fill = layer?.style.fill ?? '#2563eb'
  const stroke = selected ? '#111827' : (layer?.style.stroke ?? '#1d4ed8')
  const opacity = layer?.opacity ?? 0.7
  return new Style({
    image: new CircleStyle({
      radius: selected ? 10 : (layer?.style.pointSize ?? 8),
      fill: new Fill({ color: fill }),
      stroke: new Stroke({ color: '#ffffff', width: selected ? 3 : 2 }),
    }),
    fill: new Fill({ color: withOpacity(fill, Math.min(opacity, 0.32)) }),
    stroke: new Stroke({ color: stroke, width: selected ? 4 : (layer?.style.strokeWidth ?? 2) }),
  })
}

function withOpacity(hex: string, opacity: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}
</script>

<template>
  <div :id="mapId" class="map-canvas" :style="{ height }" />
</template>

<style scoped>
.map-canvas {
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: #e9eef5;
}
</style>
