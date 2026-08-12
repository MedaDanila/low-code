<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import { usePlatformStore } from '../../stores/platform'
import GeoRuleBuilder from '../../widgets/geo/GeoRuleBuilder.vue'
import type { GeoRule } from '../../shared/types/domain'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const platform = usePlatformStore()
const rule = ref<GeoRule | null>(null)

const entityOptions = computed(() => platform.activeSchemas.map((schema) => ({ label: schema.name, value: schema.id })))

watch(
  () => [route.params.id, platform.geoRules, platform.activeSchemas],
  () => {
    if (route.params.id && route.params.id !== 'new') {
      const source = platform.geoRules.find((item) => item.id === String(route.params.id))
      rule.value = source ? JSON.parse(JSON.stringify(source)) as GeoRule : null
      return
    }
    const [entity, target] = platform.activeSchemas
    rule.value = entity && target ? platform.createNewGeoRule(entity.id, target.id) : null
  },
  { immediate: true, deep: true },
)

async function save() {
  if (!rule.value) return
  rule.value.status = 'active'
  const saved = await platform.saveGeoRule(rule.value)
  toast.add({ severity: 'success', summary: 'Geo Rule сохранено', detail: saved.name, life: 2400 })
  router.push('/admin/geo-rules')
}
</script>

<template>
  <div>
    <UiPageHeader title="Geo Rule Builder" description="Rule builder для spatial checks.">
      <template #actions>
        <UiButton label="Сохранить" icon="pi pi-save" @click="save" />
      </template>
    </UiPageHeader>
    <div v-if="rule" class="panel">
      <GeoRuleBuilder v-model="rule" :entity-options="entityOptions" />
    </div>
  </div>
</template>
