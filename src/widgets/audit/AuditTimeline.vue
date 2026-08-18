<script setup lang="ts">
import { formatDate, formatDateTime, formatValue } from '../../shared/lib/format'
import { usePlatformStore } from '../../stores/platform'
import type { AuditEvent, AuditFieldChange, ObjectValue } from '../../shared/types/domain'

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

function changeValue(event: AuditEvent, change: AuditFieldChange, value: AuditFieldChange['oldValue']): string {
  if (change.fieldType === 'geometry') return value ? 'Есть' : 'Нет'
  if (change.fieldType === 'status') return statusLabel(value)

  const schema = platform.schemaById(event.entityId)
  const field = schema?.fields.find((item) => item.code === change.fieldCode)
  const dictionary = field?.enumId ? platform.dictionaryById(field.enumId) : undefined
  const enumLabel = dictionary?.items.find((item) => item.code === value)?.name

  if (field?.type === 'datetime' && typeof value === 'string') return formatDateTime(value)
  if (field?.type === 'date') return formatDate(value as ObjectValue)
  return String(enumLabel ?? formatValue(value as ObjectValue))
}

function statusLabel(value: AuditFieldChange['oldValue']): string {
  const labels: Record<string, string> = {
    published: 'Опубликовано',
    incomplete: 'Черновик',
    draft: 'Черновик',
    review: 'На проверке',
    approval: 'Согласование',
    active: 'Активен',
    closed: 'Закрыт',
  }
  return labels[String(value ?? '')] ?? formatValue(value as ObjectValue)
}
</script>

<template>
  <div class="audit">
    <div class="audit__list">
      <article v-for="event in events" :key="event.id" class="audit__event">
        <time>{{ formatDateTime(event.at) }}</time>
        <strong>{{ userName(event.actorId) }}</strong>
        <div class="audit__content">
          <span>{{ eventText(event) }}</span>
          <ul v-if="event.changes?.length" class="audit__changes">
            <li v-for="change in event.changes" :key="`${event.id}-${change.fieldCode}`">
              <b>{{ change.fieldName }}</b>
              <span>{{ changeValue(event, change, change.oldValue) }} → {{ changeValue(event, change, change.newValue) }}</span>
            </li>
          </ul>
        </div>
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

.audit__content {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.audit__changes {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.audit__changes li {
  display: grid;
  grid-template-columns: minmax(140px, 220px) minmax(0, 1fr);
  gap: 10px;
  padding: 7px 9px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
  font-size: 13px;
}

.audit__changes b {
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit__changes span {
  min-width: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 820px) {
  .audit__event,
  .audit__changes li {
    grid-template-columns: 1fr;
  }
}
</style>
