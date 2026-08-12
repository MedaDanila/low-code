<script setup lang="ts">
import { computed, ref } from 'vue'
import UiButton from '../../shared/ui/UiButton.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTabs from '../../shared/ui/UiTabs.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { usePlatformStore } from '../../stores/platform'

const platform = usePlatformStore()
const step = ref('entity')
const entityId = ref<string | number | boolean | null>(platform.activeSchemas[0]?.id ?? null)
const tabs = [
  { label: '1 Entity', value: 'entity' },
  { label: '2 Upload', value: 'upload' },
  { label: '3 Mapping', value: 'mapping' },
  { label: '4 Validation', value: 'validation' },
  { label: '5 Result', value: 'result' },
]
const selectedSchema = computed(() => platform.schemaById(String(entityId.value)))
const entityOptions = computed(() => platform.activeSchemas.map((schema) => ({ label: schema.name, value: schema.id })))
const mappingRows = computed<Record<string, unknown>[]>(() =>
  selectedSchema.value?.fields.map((field) => ({ column: field.name, field: field.name, status: 'Mapped' })) ?? [],
)
</script>

<template>
  <div>
    <UiPageHeader title="Импорт" description="CSV/XLSX wizard с field mapping и validation preview." />
    <div class="panel stack">
      <UiTabs v-model="step" :tabs="tabs" />
      <section v-if="step === 'entity'" class="form-field">
        <label>Выбрать Entity</label>
        <UiSelect v-model="entityId" :options="entityOptions" />
      </section>
      <section v-else-if="step === 'upload'" class="upload-zone">
        <strong>Upload CSV/XLSX</strong>
        <span>orders_august.xlsx</span>
      </section>
      <UiTable
        v-else-if="step === 'mapping'"
        :rows="mappingRows"
        :columns="[
          { field: 'column', header: 'Column' },
          { field: 'field', header: 'Entity field' },
          { field: 'status', header: 'Status' },
        ]"
      />
      <section v-else-if="step === 'validation'" class="metric-grid">
        <article class="metric-card"><span>Valid</span><strong>132</strong></article>
        <article class="metric-card"><span>Errors</span><strong>7</strong></article>
      </section>
      <section v-else class="panel">
        <p>Import result: 132 rows imported, 7 rows skipped with validation errors.</p>
      </section>
      <div class="inline-actions">
        <UiButton label="Назад" severity="secondary" variant="outlined" />
        <UiButton label="Далее" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.upload-zone {
  display: grid;
  gap: 8px;
  justify-items: center;
  padding: 48px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-surface-muted);
}
</style>
