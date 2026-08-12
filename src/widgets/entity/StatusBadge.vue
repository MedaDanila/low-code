<script setup lang="ts">
import UiBadge from '../../shared/ui/UiBadge.vue'

const props = defineProps<{
  status?: string
}>()

const labels: Record<string, string> = {
  draft: 'Черновик',
  review: 'На проверке',
  approval: 'Согласование',
  active: 'В работе',
  closed: 'Закрыт',
  archived: 'Архив',
  done: 'Выполнено',
  overdue: 'Просрочено',
  new: 'Новая',
}

const tones: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  draft: 'neutral',
  review: 'info',
  approval: 'warning',
  active: 'success',
  closed: 'neutral',
  archived: 'neutral',
  done: 'success',
  overdue: 'danger',
  new: 'info',
}
</script>

<template>
  <UiBadge :label="labels[props.status ?? ''] ?? props.status ?? '—'" :tone="tones[props.status ?? ''] ?? 'neutral'" />
</template>
