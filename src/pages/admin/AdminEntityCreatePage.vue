<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import UiButton from '../../shared/ui/UiButton.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTextarea from '../../shared/ui/UiTextarea.vue'
import { usePlatformStore } from '../../stores/platform'
import type { GeometryType } from '../../shared/types/domain'

const router = useRouter()
const platform = usePlatformStore()
const name = ref('Парковки')
const description = ref('Муниципальные парковочные пространства')
const geometryType = ref<string | number | boolean | null>('point')
const saving = ref(false)

const geometryOptions = [
  { label: 'None', value: 'none' },
  { label: 'Point', value: 'point' },
  { label: 'LineString', value: 'lineString' },
  { label: 'Polygon', value: 'polygon' },
]

async function submit() {
  saving.value = true
  try {
    const schema = await platform.createSchema({
      name: String(name.value),
      description: String(description.value),
      geometryType: String(geometryType.value) as GeometryType,
    })
    router.push(`/admin/entities/${schema.id}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <UiPageHeader title="Создать сущность" description="После создания вы попадёте в Entity Builder." />
    <form class="panel form-grid" @submit.prevent="submit">
      <div class="form-field">
        <label for="entity-name">Название</label>
        <UiInput id="entity-name" v-model="name" />
      </div>
      <div class="form-field full">
        <label for="entity-description">Описание</label>
        <UiTextarea id="entity-description" v-model="description" />
      </div>
      <div class="form-field">
        <label for="entity-geometry">Geometry type</label>
        <UiSelect id="entity-geometry" v-model="geometryType" :options="geometryOptions" />
      </div>
      <div class="form-field full">
        <UiButton label="Создать" type="submit" icon="pi pi-plus" :loading="saving" />
      </div>
    </form>
  </div>
</template>
