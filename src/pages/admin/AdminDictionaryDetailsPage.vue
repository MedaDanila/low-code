<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Checkbox from 'primevue/checkbox'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiDialog from '../../shared/ui/UiDialog.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import { createId } from '../../shared/lib/id'
import { readSpreadsheetColumnsFile, slugifyCode, type ImportedSpreadsheetColumn } from '../../shared/lib/dictionaryImport'
import { usePlatformStore } from '../../stores/platform'
import type { Dictionary } from '../../shared/types/domain'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const platform = usePlatformStore()
const editable = ref<Dictionary | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const saving = ref(false)
const search = ref('')
const importColumns = ref<ImportedSpreadsheetColumn[]>([])
const selectedImportColumn = ref<string | number | boolean | null>(null)
const importDialogVisible = ref(false)

watch(
  () => [route.params.id, platform.dictionaries],
  () => {
    const source = platform.dictionaries.find((dictionary) => dictionary.id === String(route.params.id))
    editable.value = source ? JSON.parse(JSON.stringify(source)) as Dictionary : null
  },
  { immediate: true, deep: true },
)

const selectedEntity = computed(() => (editable.value ? platform.schemaById(editable.value.entityId) : undefined))
const filteredItems = computed(() => {
  const query = search.value.trim().toLowerCase()
  const items = editable.value?.items ?? []
  if (!query) return items
  return items.filter((item) => item.name.toLowerCase().includes(query))
})
const importColumnOptions = computed(() =>
  importColumns.value.map((column) => ({
    label: `${column.label} · ${column.values.length}`,
    value: column.index,
  })),
)

function addItem() {
  if (!editable.value) return
  const name = `Новое значение ${editable.value.items.length + 1}`
  editable.value.items.push({
    id: createId('di'),
    name,
    code: slugifyCode(name),
    active: true,
  })
}

function deleteItem(itemId: string) {
  if (!editable.value) return
  editable.value.items = editable.value.items.filter((item) => item.id !== itemId)
}

function normalizeItemCode(itemId: string) {
  const item = editable.value?.items.find((candidate) => candidate.id === itemId)
  if (item && !item.code.trim()) item.code = slugifyCode(item.name)
}

function blurDictionaryTitle(event: KeyboardEvent) {
  ;(event.target as HTMLElement).blur()
}

async function save() {
  if (!editable.value) return
  saving.value = true
  try {
    await platform.saveDictionary(editable.value)
    toast.add({ severity: 'success', summary: 'Справочник сохранён', detail: editable.value.name, life: 2200 })
  } finally {
    saving.value = false
  }
}

async function removeDictionary() {
  if (!editable.value) return
  await platform.deleteDictionary(editable.value.id)
  toast.add({ severity: 'info', summary: 'Справочник удалён', life: 2200 })
  router.push('/admin/dictionaries')
}

async function importFromFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !editable.value) return
  try {
    const columns = await readSpreadsheetColumnsFile(file)
    if (columns.length === 0) {
      toast.add({ severity: 'warn', summary: 'В файле нет колонок со значениями', life: 2600 })
      return
    }
    importColumns.value = columns
    selectedImportColumn.value = columns[0].index
    importDialogVisible.value = true
  } catch (cause) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось импортировать файл',
      detail: cause instanceof Error ? cause.message : 'Проверьте формат файла',
      life: 3600,
    })
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function importSelectedColumn() {
  if (!editable.value) return
  const column = importColumns.value.find((candidate) => candidate.index === selectedImportColumn.value)
  if (!column) return

  const existingByName = new Map(editable.value.items.map((item) => [item.name.trim().toLowerCase(), item]))
  const uniqueValues = Array.from(new Set(column.values.map((value) => value.trim()).filter(Boolean)))
  uniqueValues.forEach((name) => {
    const existing = existingByName.get(name.toLowerCase())
    if (existing) {
      existing.active = true
      return
    }
    editable.value?.items.push({
      id: createId('di'),
      name,
      code: slugifyCode(name),
      active: true,
    })
  })

  await save()
  importDialogVisible.value = false
  toast.add({ severity: 'success', summary: 'Колонка импортирована', detail: `${uniqueValues.length} значений`, life: 2600 })
}
</script>

<template>
  <div>
    <UiEmptyState v-if="!editable" title="Справочник не найден" />
    <template v-else>
      <UiPageHeader :title="editable.name" :description="selectedEntity ? `Сущность: ${selectedEntity.name}` : 'Справочник сущности'">
        <template #title>
          <input
            v-model="editable.name"
            class="dictionary-heading-input"
            spellcheck="false"
            aria-label="Название справочника"
            @keydown.enter.prevent="blurDictionaryTitle"
          />
        </template>
        <template #actions>
          <UiButton label="Назад" severity="secondary" variant="outlined" @click="router.push('/admin/dictionaries')" />
          <UiButton label="Удалить" severity="danger" variant="outlined" @click="removeDictionary" />
          <UiButton label="Сохранить" icon="pi pi-save" :loading="saving" @click="save" />
        </template>
      </UiPageHeader>

      <section class="panel stack">
        <div class="inline-actions" style="justify-content: space-between">
          <h3 class="surface-title">Значения</h3>
          <div class="inline-actions">
            <UiInput v-model="search" placeholder="Поиск по значениям" />
            <UiButton label="Добавить" icon="pi pi-plus" severity="secondary" variant="outlined" @click="addItem" />
            <UiButton label="Загрузить из Excel" icon="pi pi-upload" severity="secondary" variant="outlined" @click="fileInput?.click()" />
            <input
              ref="fileInput"
              class="dictionary-file-input"
              type="file"
              accept=".xlsx,.csv,.tsv,.txt"
              @change="importFromFile"
            />
          </div>
        </div>

        <UiEmptyState
          v-if="editable.items.length === 0"
          title="Значений пока нет"
          description="Добавьте значение вручную или загрузите файл Excel."
        />
        <UiEmptyState
          v-else-if="filteredItems.length === 0"
          title="Ничего не найдено"
          description="Попробуйте изменить поисковый запрос."
        />

        <table v-else class="dictionary-item-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredItems" :key="item.id">
              <td>
                <UiInput v-model="item.name" @blur="normalizeItemCode(item.id)" />
              </td>
              <td>
                <Checkbox v-model="item.active" binary />
              </td>
              <td>
                <UiButton label="Удалить" severity="danger" variant="outlined" @click="deleteItem(item.id)" />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <UiDialog v-model:visible="importDialogVisible" header="Выберите колонку Excel" width="460px">
        <div class="stack">
          <div class="form-field">
            <label>Колонка со значениями</label>
            <UiSelect v-model="selectedImportColumn" :options="importColumnOptions" />
          </div>
          <p class="muted">Все непустые значения выбранной колонки будут добавлены в справочник и сразу включены.</p>
        </div>
        <template #footer>
          <UiButton label="Отмена" severity="secondary" variant="outlined" @click="importDialogVisible = false" />
          <UiButton label="Добавить значения" icon="pi pi-check" @click="importSelectedColumn" />
        </template>
      </UiDialog>
    </template>
  </div>
</template>

<style scoped>
.dictionary-file-input {
  display: none;
}

.dictionary-heading-input {
  display: block;
  min-width: 180px;
  max-width: min(720px, 60vw);
  padding: 2px 4px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  outline: none;
  cursor: text;
}

.dictionary-heading-input:hover,
.dictionary-heading-input:focus {
  background: var(--color-surface-muted);
  box-shadow: inset 0 0 0 1px var(--color-border);
}

.dictionary-item-table {
  width: 100%;
  border-collapse: collapse;
}

.dictionary-item-table th,
.dictionary-item-table td {
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: middle;
}

.dictionary-item-table th {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.dictionary-item-table th:nth-child(2),
.dictionary-item-table td:nth-child(2) {
  width: 90px;
}

.dictionary-item-table th:last-child,
.dictionary-item-table td:last-child {
  width: 110px;
}

</style>
