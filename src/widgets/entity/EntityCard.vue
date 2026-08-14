<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiTabs from '../../shared/ui/UiTabs.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { formatDateTime } from '../../shared/lib/format'
import { validateEntityObjectData } from '../../shared/lib/entityObjectValidation'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import AuditTimeline from '../audit/AuditTimeline.vue'
import MapCanvas from '../map/MapCanvas.vue'
import EntityPropertyList from './EntityPropertyList.vue'
import type { EntityObject, EntitySchema } from '../../shared/types/domain'

const props = defineProps<{
  schema: EntitySchema
  object: EntityObject
}>()

const emit = defineEmits<{
  edit: []
}>()

const toast = useToast()
const auth = useAuthStore()
const platform = usePlatformStore()
const activeTab = ref('main')

const tabs = [
  { label: 'Основное', value: 'main' },
  { label: 'Карта', value: 'map' },
  { label: 'Документы', value: 'documents' },
  { label: 'История', value: 'history' },
]

const title = computed(() => {
  return String(
    props.object.values.name
    ?? props.object.values.title
    ?? props.object.values.number
    ?? props.object.values.address
    ?? props.object.id,
  )
})

const objectLayers = computed(() => platform.layers.filter((layer) => layer.entityId === props.object.entityId))
const visibleLayerIds = computed(() => objectLayers.value.map((layer) => layer.id))
const dataIssues = computed(() =>
  validateEntityObjectData({
    schema: props.schema,
    dictionaries: platform.dictionaries.filter((dictionary) => dictionary.entityId === props.schema.id),
    values: props.object.values,
    geometry: props.object.geometry,
  }),
)
const hasIncompleteData = computed(() => dataIssues.value.length > 0)
const documents = computed(() => platform.attachmentsByObject(props.schema.id, props.object.id))
const auditEvents = computed(() => platform.auditByObject(props.schema.id, props.object.id))
const documentRows = computed<Record<string, unknown>[]>(() =>
  documents.value.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    date: formatDateTime(attachment.date),
    author: platform.userById(attachment.authorId)?.lastName ?? 'Система',
    size: attachment.size,
  })),
)

async function generateDocument() {
  if (!auth.currentUser) return
  await platform.addAttachment(props.schema.id, props.object.id, auth.currentUser.id, `${title.value}.pdf`)
  toast.add({ severity: 'success', summary: 'Документ сформирован', detail: `${title.value}.pdf`, life: 2400 })
}

</script>

<template>
  <div class="entity-card">
    <div class="entity-card__main">
      <div class="entity-card__header">
        <div class="inline-actions">
          <UiButton label="Редактировать" icon="pi pi-pencil" severity="secondary" variant="outlined" @click="emit('edit')" />
        </div>
      </div>

      <div v-if="hasIncompleteData" class="entity-card__issues">
        <strong>Данные неполные</strong>
        <span>Проверьте подсвеченные поля и геометрию, затем сохраните изменения.</span>
      </div>

      <UiTabs v-model="activeTab" :tabs="tabs" />

      <EntityPropertyList v-if="activeTab === 'main'" :schema="schema" :object="object" />
      <MapCanvas
        v-else-if="activeTab === 'map'"
        :layers="objectLayers"
        :schemas="[schema]"
        :objects="[object]"
        :visible-layer-ids="visibleLayerIds"
        :selected-object-id="object.id"
        height="440px"
      />
      <div v-else-if="activeTab === 'documents'" class="stack">
        <div class="inline-actions">
          <UiButton label="Загрузить" icon="pi pi-upload" severity="secondary" variant="outlined" />
          <UiButton label="Сформировать документ" icon="pi pi-file-pdf" @click="generateDocument" />
        </div>
        <UiTable
          :rows="documentRows"
          :columns="[
            { field: 'name', header: 'Название' },
            { field: 'type', header: 'Тип', width: '110px' },
            { field: 'date', header: 'Дата' },
            { field: 'author', header: 'Автор' },
            { field: 'size', header: 'Размер', width: '110px' },
          ]"
          empty-message="Документов пока нет"
        />
      </div>
      <AuditTimeline v-else :events="auditEvents" />
    </div>
  </div>
</template>

<style scoped>
.entity-card {
  display: grid;
  gap: 18px;
}

.entity-card__main {
  display: grid;
  gap: 16px;
  align-content: start;
}

.entity-card__main {
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.entity-card__header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
}

.entity-card__issues {
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid #f59e0b;
  border-radius: var(--radius-md);
  background: #fffbeb;
  color: #92400e;
}

.entity-card__issues strong {
  color: #78350f;
}

.entity-card__issues span {
  font-size: 13px;
}

</style>
