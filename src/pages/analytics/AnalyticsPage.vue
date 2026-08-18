<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import { usePlatformStore } from '../../stores/platform'

const router = useRouter()
const platform = usePlatformStore()
const ordersSchema = computed(() => platform.schemaByCode('orders'))
const orders = computed(() => (ordersSchema.value ? platform.objectsByEntity(ordersSchema.value.id) : []))
const statusLabels: Record<string, string> = {
  published: 'Опубликовано',
  incomplete: 'Черновик',
  draft: 'Черновик',
  review: 'На проверке',
  approval: 'Согласование',
  active: 'Опубликовано',
  closed: 'Закрыт',
}
const statusBuckets = computed(() => {
  const buckets = new Map<string, number>()
  orders.value.forEach((object) => buckets.set(object.status ?? 'draft', (buckets.get(object.status ?? 'draft') ?? 0) + 1))
  return Array.from(buckets.entries()).map(([status, count]) => ({ status, count }))
})
const contractors = computed(() => {
  const buckets = new Map<string, number>()
  orders.value.forEach((object) => {
    const contractor = String(object.values.contractor ?? 'Не указан')
    buckets.set(contractor, (buckets.get(contractor) ?? 0) + 1)
  })
  return Array.from(buckets.entries()).map(([name, count]) => ({ name, count }))
})
const auditFieldChanges = computed(() =>
  platform.auditEvents.flatMap((event) => (event.changes ?? []).map((change) => ({ event, change }))),
)
const changedObjectCount = computed(() => new Set(auditFieldChanges.value.map((item) => item.event.objectId)).size)
const bulkEditEventCount = computed(() =>
  platform.auditEvents.filter((event) => event.title === 'Массовое редактирование объекта').length
)
const changedFields = computed(() => {
  const buckets = new Map<string, { name: string; count: number }>()
  auditFieldChanges.value.forEach(({ change }) => {
    const current = buckets.get(change.fieldCode) ?? { name: change.fieldName, count: 0 }
    current.count += 1
    buckets.set(change.fieldCode, current)
  })
  return Array.from(buckets.values()).sort((left, right) => right.count - left.count).slice(0, 6)
})
const changeAuthors = computed(() => {
  const buckets = new Map<string, number>()
  auditFieldChanges.value.forEach(({ event }) => buckets.set(event.actorId, (buckets.get(event.actorId) ?? 0) + 1))
  return Array.from(buckets.entries())
    .map(([actorId, count]) => ({
      name: platform.userById(actorId)?.lastName ?? 'Система',
      count,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 6)
})
</script>

<template>
  <div>
    <UiPageHeader title="Аналитика" description="Компактная аналитическая панель без конструктора аналитики." />

    <UiEmptyState
      v-if="platform.entityObjects.length === 0"
      title="Нет данных для аналитики"
      description="Создайте или импортируйте объекты, чтобы здесь появились показатели и графики."
    >
      <UiButton label="Импортировать данные" icon="pi pi-upload" @click="router.push('/admin/import')" />
    </UiEmptyState>

    <template v-else>
    <section class="metric-grid">
      <article class="metric-card"><span>Всего</span><strong>{{ orders.length }}</strong></article>
      <article class="metric-card"><span>Опубликовано</span><strong>{{ orders.filter((item) => item.status === 'published').length }}</strong></article>
      <article class="metric-card"><span>Черновики</span><strong>{{ orders.filter((item) => item.status === 'draft').length }}</strong></article>
      <article class="metric-card"><span>Просроченные</span><strong>0</strong></article>
      <article class="metric-card"><span>Полевых изменений</span><strong>{{ auditFieldChanges.length }}</strong></article>
      <article class="metric-card"><span>Объектов изменено</span><strong>{{ changedObjectCount }}</strong></article>
      <article class="metric-card"><span>Массовых сохранений</span><strong>{{ bulkEditEventCount }}</strong></article>
    </section>
    <section class="page-grid two" style="margin-top: 18px">
      <div class="panel">
        <h3 class="surface-title">Частые изменения полей</h3>
        <div class="bar-list">
          <div v-for="bucket in changedFields" :key="bucket.name" class="bar-row">
            <span>{{ bucket.name }}</span>
            <div><i :style="{ width: `${Math.max(bucket.count * 12, 16)}%` }" /></div>
            <strong>{{ bucket.count }}</strong>
          </div>
          <p v-if="changedFields.length === 0" class="analytics-empty">Нет изменений</p>
        </div>
      </div>
      <div class="panel">
        <h3 class="surface-title">Активность пользователей</h3>
        <div class="bar-list">
          <div v-for="bucket in changeAuthors" :key="bucket.name" class="bar-row">
            <span>{{ bucket.name }}</span>
            <div><i :style="{ width: `${Math.max(bucket.count * 12, 16)}%` }" /></div>
            <strong>{{ bucket.count }}</strong>
          </div>
          <p v-if="changeAuthors.length === 0" class="analytics-empty">Нет изменений</p>
        </div>
      </div>
    </section>
    <section class="page-grid two" style="margin-top: 18px">
      <div class="panel">
        <h3 class="surface-title">По статусам</h3>
        <div class="bar-list">
          <div v-for="bucket in statusBuckets" :key="bucket.status" class="bar-row">
            <span>{{ statusLabels[bucket.status] ?? bucket.status }}</span>
            <div><i :style="{ width: `${Math.max(bucket.count * 28, 16)}%` }" /></div>
            <strong>{{ bucket.count }}</strong>
          </div>
        </div>
      </div>
      <div class="panel">
        <h3 class="surface-title">По исполнителям</h3>
        <div class="bar-list">
          <div v-for="bucket in contractors" :key="bucket.name" class="bar-row">
            <span>{{ bucket.name }}</span>
            <div><i :style="{ width: `${Math.max(bucket.count * 28, 16)}%` }" /></div>
            <strong>{{ bucket.count }}</strong>
          </div>
        </div>
      </div>
    </section>
    <section class="panel" style="margin-top: 18px">
      <h3 class="surface-title">Динамика создания ордеров</h3>
      <div class="sparkline" aria-label="График динамики создания ордеров">
        <span v-for="height in [38, 54, 42, 80, 62, 96, 74, 88]" :key="height" :style="{ height: `${height}px` }" />
      </div>
    </section>
    </template>
  </div>
</template>

<style scoped>
.bar-list {
  display: grid;
  gap: 12px;
}

.bar-row {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr) 40px;
  gap: 10px;
  align-items: center;
}

.bar-row div {
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-surface-muted);
}

.bar-row i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-accent);
}

.sparkline {
  height: 150px;
  display: flex;
  align-items: end;
  gap: 10px;
}

.sparkline span {
  width: 34px;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: linear-gradient(180deg, #2563eb, #60a5fa);
}

.analytics-empty {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}
</style>
