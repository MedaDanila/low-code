<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import { usePlatformStore } from '../../stores/platform'
import EntityRegistry from '../../widgets/entity/EntityRegistry.vue'

const route = useRoute()
const platform = usePlatformStore()
const entityCode = computed(() => String(route.params.entityCode))
const schema = computed(() => platform.schemaByCode(entityCode.value))
const objects = computed(() => (schema.value ? platform.objectsByEntity(schema.value.id) : []))
</script>

<template>
  <div>
    <UiEmptyState v-if="!schema" title="Сущность не найдена" description="Проверьте публикацию и системный код сущности." />
    <EntityRegistry v-else :schema="schema" :objects="objects" :loading="platform.loading" />
  </div>
</template>
