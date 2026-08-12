<script setup lang="ts">
import { computed, ref } from 'vue'
import UiTabs from '../../shared/ui/UiTabs.vue'
import { formatDateTime } from '../../shared/lib/format'
import { usePlatformStore } from '../../stores/platform'
import type { AuditEvent } from '../../shared/types/domain'

const props = defineProps<{
  events: AuditEvent[]
}>()

const platform = usePlatformStore()
const filter = ref('all')
const tabs = [
  { label: 'Все', value: 'all' },
  { label: 'Изменения', value: 'change' },
  { label: 'Workflow', value: 'workflow' },
  { label: 'Документы', value: 'document' },
]

const filteredEvents = computed(() =>
  props.events.filter((event) => filter.value === 'all' || event.kind === filter.value),
)
</script>

<template>
  <div class="audit">
    <UiTabs v-model="filter" :tabs="tabs" />
    <div class="audit__list">
      <article v-for="event in filteredEvents" :key="event.id" class="audit__event">
        <time>{{ formatDateTime(event.at) }}</time>
        <strong>{{ platform.userById(event.actorId)?.lastName ?? 'System' }}</strong>
        <span>{{ event.title }}</span>
        <small v-if="event.details">{{ event.details }}</small>
      </article>
    </div>
  </div>
</template>

<style scoped>
.audit,
.audit__list {
  display: grid;
  gap: 12px;
}

.audit__event {
  display: grid;
  grid-template-columns: 150px 110px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

time,
small {
  color: var(--color-text-secondary);
}
</style>
