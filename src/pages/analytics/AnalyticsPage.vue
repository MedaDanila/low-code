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
  draft: 'Черновик',
  review: 'На проверке',
  approval: 'Согласование',
  active: 'В работе',
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
      <article class="metric-card"><span>Активные</span><strong>{{ orders.filter((item) => item.status === 'active').length }}</strong></article>
      <article class="metric-card"><span>На проверке</span><strong>{{ orders.filter((item) => item.status === 'review').length }}</strong></article>
      <article class="metric-card"><span>Просроченные</span><strong>0</strong></article>
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
</style>
