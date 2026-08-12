<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import UiButton from '../../shared/ui/UiButton.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiTabs from '../../shared/ui/UiTabs.vue'
import { formatValue } from '../../shared/lib/format'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import StatusBadge from '../../widgets/entity/StatusBadge.vue'

const router = useRouter()
const auth = useAuthStore()
const platform = usePlatformStore()
const tab = ref('all')
const tabs = [
  { label: 'Все', value: 'all' },
  { label: 'Мои', value: 'mine' },
  { label: 'Просроченные', value: 'overdue' },
  { label: 'Выполненные', value: 'done' },
]

const filteredTasks = computed(() =>
  platform.tasks.filter((task) => {
    if (tab.value === 'mine') return task.assigneeId === auth.currentUser?.id
    if (tab.value === 'overdue') return task.status === 'overdue'
    if (tab.value === 'done') return task.status === 'done'
    return true
  }),
)

function openTask(entityId: string, objectId: string) {
  const schema = platform.schemaById(entityId)
  if (schema) router.push(`/app/entities/${schema.code}/${objectId}`)
}
</script>

<template>
  <div>
    <UiPageHeader title="Мои задачи" description="Workflow transitions создают задачи для ответственных ролей." />
    <div class="panel stack">
      <UiTabs v-model="tab" :tabs="tabs" />
      <article v-for="task in filteredTasks" :key="task.id" class="task-row">
        <div>
          <strong>{{ task.title }}</strong>
          <span>Объект: {{ platform.schemaById(task.entityId)?.name }} №{{ formatValue(platform.objectById(task.objectId)?.values.number ?? null) }}</span>
        </div>
        <span>Назначено: {{ platform.userById(task.assigneeId)?.lastName }}</span>
        <span>Срок: {{ task.dueDate }}</span>
        <StatusBadge :status="task.status" />
        <UiButton label="Открыть" severity="secondary" variant="outlined" @click="openTask(task.entityId, task.objectId)" />
      </article>
      <p v-if="filteredTasks.length === 0" class="muted">Задач в этой вкладке нет.</p>
    </div>
  </div>
</template>

<style scoped>
.task-row {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) 180px 120px 120px 100px;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.task-row div {
  display: grid;
  gap: 4px;
}

.task-row span {
  color: var(--color-text-secondary);
}
</style>
