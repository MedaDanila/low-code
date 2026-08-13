<script setup lang="ts">
import Slider from 'primevue/slider'
import type { Layer } from '../../shared/types/domain'

defineProps<{
  layers: Layer[]
  visibleLayerIds: string[]
}>()

const emit = defineEmits<{
  toggle: [layerId: string]
  opacity: [layerId: string, opacity: number]
}>()
</script>

<template>
  <div class="layer-panel">
    <h3>Слои</h3>
    <p v-if="layers.length === 0" class="muted">Слои появятся после публикации сущностей с геометрией.</p>
    <div v-for="layer in layers" :key="layer.id" class="layer-panel__item">
      <label>
        <input
          type="checkbox"
          :checked="visibleLayerIds.includes(layer.id)"
          @change="emit('toggle', layer.id)"
        />
        <span>{{ layer.name }}</span>
      </label>
      <Slider
        :model-value="Math.round(layer.opacity * 100)"
        :min="20"
        :max="100"
        @update:model-value="emit('opacity', layer.id, Number($event) / 100)"
      />
    </div>
  </div>
</template>

<style scoped>
.layer-panel {
  display: grid;
  gap: 12px;
}

h3 {
  margin: 0;
  font-size: 15px;
}

.layer-panel__item {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 650;
}
</style>
