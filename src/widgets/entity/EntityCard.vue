<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiDialog from '../../shared/ui/UiDialog.vue'
import UiTabs from '../../shared/ui/UiTabs.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { formatDateTime } from '../../shared/lib/format'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import AuditTimeline from '../audit/AuditTimeline.vue'
import GeoValidationResult from '../geo/GeoValidationResult.vue'
import MapCanvas from '../map/MapCanvas.vue'
import WorkflowActions from '../workflow/WorkflowActions.vue'
import EntityPropertyList from './EntityPropertyList.vue'
import StatusBadge from './StatusBadge.vue'
import type { EntityObject, EntitySchema, GeoValidationResult as GeoValidationResultType } from '../../shared/types/domain'

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
const validationResult = ref<GeoValidationResultType | null>(null)
const validationVisible = ref(false)

const tabs = [
  { label: 'Основное', value: 'main' },
  { label: 'Карта', value: 'map' },
  { label: 'Документы', value: 'documents' },
  { label: 'История', value: 'history' },
]

const title = computed(() => {
  const number = props.object.values.number ?? props.object.values.name ?? props.object.id
  return `${props.schema.name.slice(0, -1) || props.schema.name} №${number}`
})

const objectLayers = computed(() => platform.layers.filter((layer) => layer.entityId === props.object.entityId))
const visibleLayerIds = computed(() => objectLayers.value.map((layer) => layer.id))
const documents = computed(() => platform.attachmentsByObject(props.schema.id, props.object.id))
const auditEvents = computed(() => platform.auditByObject(props.schema.id, props.object.id))
const documentRows = computed<Record<string, unknown>[]>(() =>
  documents.value.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    date: formatDateTime(attachment.date),
    author: platform.userById(attachment.authorId)?.lastName ?? 'System',
    size: attachment.size,
  })),
)

async function generateDocument() {
  if (!auth.currentUser) return
  await platform.addAttachment(props.schema.id, props.object.id, auth.currentUser.id, `${title.value}.pdf`)
  toast.add({ severity: 'success', summary: 'Документ сформирован', detail: `${title.value}.pdf`, life: 2400 })
}

function showGeoConflict(result: GeoValidationResultType) {
  validationResult.value = result
  validationVisible.value = true
}
</script>

<template>
  <div class="entity-card">
    <div class="entity-card__main">
      <div class="entity-card__header">
        <div>
          <h2>{{ title }}</h2>
          <StatusBadge :status="object.status" />
        </div>
        <div class="inline-actions">
          <UiButton label="Редактировать" icon="pi pi-pencil" severity="secondary" variant="outlined" @click="emit('edit')" />
          <UiButton label="Menu" icon="pi pi-ellipsis-v" severity="secondary" variant="outlined" />
        </div>
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
          <UiButton label="Upload" icon="pi pi-upload" severity="secondary" variant="outlined" />
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

    <aside class="entity-card__side">
      <WorkflowActions :schema="schema" :object="object" @geo-conflict="showGeoConflict" />
    </aside>

    <UiDialog v-if="validationResult" v-model:visible="validationVisible" header="Geo validation">
      <GeoValidationResult
        :result="validationResult"
        @close="validationVisible = false"
        @show-on-map="activeTab = 'map'; validationVisible = false"
      />
    </UiDialog>
  </div>
</template>

<style scoped>
.entity-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 18px;
}

.entity-card__main,
.entity-card__side {
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

h2 {
  margin: 0 0 8px;
  font-size: 22px;
}
</style>
