<script setup lang="ts">
import { formatDateTime } from '../../shared/lib/format'
import { usePlatformStore } from '../../stores/platform'
import type { AuditEvent } from '../../shared/types/domain'

const props = defineProps<{
  events: AuditEvent[]
}>()

const platform = usePlatformStore()

function userName(actorId: string): string {
  const user = platform.userById(actorId)
  if (!user) return 'Система'
  return [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ')
}

function eventText(event: AuditEvent): string {
  if (event.kind === 'workflow' && event.title.startsWith('Статус:')) {
    return event.title
  }

  return event.details ? `${event.title}. ${event.details}` : event.title
}
</script>

<template>
  <div class="audit">
    <div class="audit__list">
      <article v-for="event in events" :key="event.id" class="audit__event">
        <time>{{ formatDateTime(event.at) }}</time>
        <strong>{{ userName(event.actorId) }}</strong>
        <span>{{ eventText(event) }}</span>
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
  grid-template-columns: 160px 220px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

time {
  color: var(--color-text-secondary);
}
</style>
