<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import Feature from 'ol/Feature'
import Map from 'ol/Map'
import OSM from 'ol/source/OSM'
import Cluster from 'ol/source/Cluster'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import View from 'ol/View'
import { Fill, Stroke, Style, Text } from 'ol/style'
import CircleStyle from 'ol/style/Circle'
import { fromLonLat } from 'ol/proj'
import { boundingExtent } from 'ol/extent'
import type { FeatureLike } from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import { MAP_CONFIG } from '../../shared/config/map'
import type { Coordinates, EntityMapColorRule, EntityMapStyle, EntityObject, EntitySchema, Layer, MapGeometryType, ObjectValue } from '../../shared/types/domain'
import { domainToFeature } from './olGeometry'

const props = withDefaults(
  defineProps<{
    layers: Layer[]
    schemas: EntitySchema[]
    objects: EntityObject[]
    visibleLayerIds: string[]
    selectedObjectId?: string
    center?: Coordinates
    zoom?: number
    fitSingleObject?: boolean
    height?: string
  }>(),
  {
    selectedObjectId: '',
    center: () => MAP_CONFIG.defaultCenter,
    zoom: MAP_CONFIG.defaultZoom,
    fitSingleObject: true,
    height: '520px',
  },
)

const emit = defineEmits<{
  selectObject: [object: EntityObject]
}>()

let map: Map | null = null
const source = new VectorSource<Feature<Geometry>>()
const clusterRawSource = new VectorSource<Feature<Geometry>>()
const clusterSource = new Cluster<Feature<Geometry>>({
  distance: 44,
  source: clusterRawSource,
})
const mapId = `map-${Math.random().toString(36).slice(2)}`

onMounted(() => {
  map = new Map({
    target: mapId,
    layers: [
      new TileLayer({ source: new OSM({ url: MAP_CONFIG.tileUrl }) }),
      new VectorLayer({ source, style: styleFeature }),
      new VectorLayer({ source: clusterSource, style: styleClusterFeature }),
    ],
    view: new View({
      center: fromLonLat(props.center),
      zoom: props.zoom,
    }),
  })
  map.on('singleclick', (event) => {
    let selected: EntityObject | undefined
    map?.forEachFeatureAtPixel(event.pixel, (feature) => {
      const clusteredFeatures = feature.get('features') as Feature<Geometry>[] | undefined
      const targetFeature = clusteredFeatures?.[0] ?? feature
      const objectId = targetFeature.get('objectId') as string | undefined
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
  () => [props.objects, props.layers, props.schemas, props.visibleLayerIds, props.selectedObjectId],
  renderFeatures,
  { deep: true },
)

watch(
  () => [props.center[0], props.center[1], props.zoom],
  () => {
    if (!map || props.selectedObjectId) return
    map.getView().animate({
      center: fromLonLat(props.center),
      zoom: props.zoom,
      duration: 220,
    })
  },
)

function renderFeatures() {
  source.clear()
  clusterRawSource.clear()
  const visible = new Set(props.visibleLayerIds)
  let selectedFeature: Feature<Geometry> | null = null
  let fallbackFeature: Feature<Geometry> | null = null
  props.objects.forEach((object) => {
    if (!object.geometry) return
    const layer = props.layers.find((item) => item.entityId === object.entityId)
    if (!layer || !visible.has(layer.id)) return
    const schema = props.schemas.find((item) => item.id === object.entityId)
    const feature = domainToFeature(object.geometry)
    feature.set('objectId', object.id)
    feature.set('layerId', layer.id)
    fallbackFeature ??= feature
    if (object.id === props.selectedObjectId) selectedFeature = feature
    if (schema?.mapSettings.clusteringEnabled && object.geometry.type === 'Point') {
      clusterRawSource.addFeature(feature)
    } else {
      source.addFeature(feature)
    }
  })
  const targetFeature = selectedFeature ?? (props.fitSingleObject && props.objects.length === 1 ? fallbackFeature : null)
  if (targetFeature) requestAnimationFrame(() => fitFeature(targetFeature))
}

function fitFeature(feature: Feature<Geometry>): void {
  if (!map) return
  const extent = feature.getGeometry()?.getExtent()
  if (!extent) return
  map.updateSize()
  map.getView().fit(boundingExtent([[extent[0], extent[1]], [extent[2], extent[3]]]), {
    padding: [56, 56, 56, 56],
    maxZoom: 17,
    duration: 220,
  })
}

function styleClusterFeature(feature: FeatureLike): Style {
  const features = feature.get('features') as Feature<Geometry>[] | undefined
  if (!features || features.length === 0) return styleFeature(feature)
  if (features.length === 1) return styleFeature(features[0])

  const firstFeature = features[0]
  const layer = props.layers.find((item) => item.id === firstFeature.get('layerId'))
  const objectId = firstFeature.get('objectId') as string | undefined
  const object = props.objects.find((item) => item.id === objectId)
  const schema = props.schemas.find((item) => item.id === object?.entityId)
  const fill = schema?.mapSettings.styles.point.fill ?? layer?.style.fill ?? '#2563eb'

  return new Style({
    image: new CircleStyle({
      radius: Math.min(24, 13 + features.length),
      fill: new Fill({ color: fill }),
      stroke: new Stroke({ color: '#ffffff', width: 3 }),
    }),
    text: new Text({
      text: String(features.length),
      fill: new Fill({ color: '#ffffff' }),
      font: '700 12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  })
}

function styleFeature(feature: FeatureLike): Style {
  const layer = props.layers.find((item) => item.id === feature.get('layerId'))
  const objectId = feature.get('objectId') as string | undefined
  const object = props.objects.find((item) => item.id === objectId)
  const schema = props.schemas.find((item) => item.id === object?.entityId)
  const matchingRule = object && schema ? schema.mapSettings.colorRules.find((rule) => matchesMapColorRule(object, rule)) : undefined
  const selected = objectId === props.selectedObjectId
  const baseStyle = object && schema ? mapStyleForObject(schema, object) : undefined
  const fill = matchingRule?.color ?? baseStyle?.fill ?? layer?.style.fill ?? '#2563eb'
  const stroke = selected ? '#111827' : (matchingRule?.color ?? baseStyle?.stroke ?? layer?.style.stroke ?? '#1d4ed8')
  const opacity = baseStyle?.opacity ?? layer?.opacity ?? 0.7
  return new Style({
    image: new CircleStyle({
      radius: selected ? 10 : (baseStyle?.pointSize ?? layer?.style.pointSize ?? 8),
      fill: new Fill({ color: fill }),
      stroke: new Stroke({ color: '#ffffff', width: selected ? 3 : 2 }),
    }),
    fill: new Fill({ color: withOpacity(fill, Math.min(opacity, 0.32)) }),
    stroke: new Stroke({ color: stroke, width: selected ? 4 : (baseStyle?.strokeWidth ?? layer?.style.strokeWidth ?? 2) }),
  })
}

function mapStyleForObject(schema: EntitySchema, object: EntityObject): EntityMapStyle {
  const geometryType = objectGeometryType(object) ?? schema.geometryType
  if (geometryType !== 'none' && schema.mapSettings.styles[geometryType]) return schema.mapSettings.styles[geometryType]
  return schema.mapSettings.styles.point
}

function objectGeometryType(object: EntityObject): MapGeometryType | undefined {
  if (object.geometry?.type === 'Point') return 'point'
  if (object.geometry?.type === 'LineString') return 'lineString'
  if (object.geometry?.type === 'Polygon') return 'polygon'
  return undefined
}

function matchesMapColorRule(object: EntityObject, rule: EntityMapColorRule): boolean {
  const value = mapRuleValue(object, rule.fieldCode)
  if (rule.operator === 'filled') return isFilled(value)
  if (rule.operator === 'empty') return !isFilled(value)

  const current = normalizeComparable(value)
  const target = rule.value.trim().toLowerCase()
  if (rule.operator === 'equals') return current === target
  if (rule.operator === 'notEquals') return current !== target
  if (rule.operator === 'contains') return current.includes(target)

  const currentDate = dateKey(value)
  const targetDate = dateKey(rule.value)
  if (currentDate && targetDate) return rule.operator === 'before' ? currentDate < targetDate : currentDate > targetDate

  const currentNumber = Number(value)
  const targetNumber = Number(rule.value)
  if (Number.isFinite(currentNumber) && Number.isFinite(targetNumber)) {
    return rule.operator === 'before' ? currentNumber < targetNumber : currentNumber > targetNumber
  }
  return false
}

function mapRuleValue(object: EntityObject, fieldCode: string): ObjectValue | string | undefined {
  if (fieldCode === '__status') return object.status ?? ''
  if (fieldCode === '__createdAt') return object.createdAt
  if (fieldCode === '__updatedAt') return object.updatedAt
  return object.values[fieldCode]
}

function isFilled(value: ObjectValue | string | undefined): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function normalizeComparable(value: ObjectValue | string | undefined): string {
  if (Array.isArray(value)) return value.join(',').toLowerCase()
  return String(value ?? '').trim().toLowerCase()
}

function dateKey(value: ObjectValue | string | undefined): string {
  if (!isFilled(value)) return ''
  const raw = String(value)
  const isoLike = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (isoLike) return isoLike

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
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
