<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { formatDateTime, formatValue } from '../../shared/lib/format'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import MapCanvas from '../../widgets/map/MapCanvas.vue'
import StatusBadge from '../../widgets/entity/StatusBadge.vue'
import type { EntityObject } from '../../shared/types/domain'

const router = useRouter()
const auth = useAuthStore()
const platform = usePlatformStore()
const selectedObjectId = ref('')
const visibleLayerIds = ref<string[]>([])

watch(
  () => platform.layers,
  (layers) => {
    if (visibleLayerIds.value.length === 0) {
      visibleLayerIds.value = layers.filter((layer) => layer.visibleByDefault).map((layer) => layer.id)
    }
  },
  { immediate: true },
)

const ordersSchema = computed(() => platform.schemaByCode('orders'))
const orderObjects = computed(() => (ordersSchema.value ? platform.objectsByEntity(ordersSchema.value.id) : []))
const activeOrders = computed(() => orderObjects.value.filter((object) => object.status === 'active').length)
const reviewOrders = computed(() => orderObjects.value.filter((object) => object.status === 'review' || object.status === 'approval').length)
const overdueOrders = computed(
  () => orderObjects.value.filter((object) => typeof object.values.endDate === 'string' && object.values.endDate < '2026-08-11').length,
)
const myTasks = computed(() => (auth.currentUser ? platform.tasksForUser(auth.currentUser.id) : []))
const latestAuditRows = computed<Record<string, unknown>[]>(() =>
  platform.auditEvents.slice(0, 5).map((event) => ({
    at: formatDateTime(event.at),
    user: platform.userById(event.actorId)?.lastName ?? 'System',
    title: event.title,
  })),
)

function selectObject(object: EntityObject) {
  selectedObjectId.value = object.id
  const schema = platform.schemaById(object.entityId)
  if (schema) router.push(`/app/entities/${schema.code}/${object.id}`)
}
</script>

<template>
  <div>
    <UiPageHeader
      eyebrow="Runtime"
      :title="platform.settings?.platformName ?? 'Муниципальная платформа'"
      :description="platform.settings?.municipalityName ?? 'Нижний Новгород'"
    />

    <section class="metric-grid">
      <article class="metric-card"><span>Всего ордеров</span><strong>{{ orderObjects.length }}</strong></article>
      <article class="metric-card"><span>Активные</span><strong>{{ activeOrders }}</strong></article>
      <article class="metric-card"><span>На проверке</span><strong>{{ reviewOrders }}</strong></article>
      <article class="metric-card"><span>Просроченные</span><strong>{{ overdueOrders }}</strong></article>
    </section>

    <section class="page-grid dashboard" style="margin-top: 18px">
      <div class="panel">
        <h3 class="surface-title">GIS карта</h3>
        <MapCanvas
          :layers="platform.layers"
          :schemas="platform.activeSchemas"
          :objects="platform.entityObjects"
          :visible-layer-ids="visibleLayerIds"
          :selected-object-id="selectedObjectId"
          height="560px"
          @select-object="selectObject"
        />
      </div>
      <aside class="stack">
        <section class="panel">
          <h3 class="surface-title">Мои задачи</h3>
          <div v-if="myTasks.length === 0" class="muted">Нет активных задач.</div>
          <article v-for="task in myTasks" :key="task.id" class="task-card">
            <strong>{{ task.title }}</strong>
            <span>Срок: {{ formatValue(task.dueDate) }}</span>
            <StatusBadge :status="task.status" />
          </article>
        </section>
        <section class="panel">
          <h3 class="surface-title">Последние изменения</h3>
          <UiTable
            :rows="latestAuditRows"
            :columns="[
              { field: 'at', header: 'Дата' },
              { field: 'user', header: 'Автор' },
              { field: 'title', header: 'Событие' },
            ]"
            :rows-per-page="5"
          />
        </section>
        <section class="panel">
          <h3 class="surface-title">Проблемные объекты</h3>
          <p class="muted">Ордер №1432 пересекается с гарантийным участком №342.</p>
        </section>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.task-card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
</style>
