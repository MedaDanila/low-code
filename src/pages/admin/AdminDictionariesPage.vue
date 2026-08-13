<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { usePlatformStore } from '../../stores/platform'

const router = useRouter()
const toast = useToast()
const platform = usePlatformStore()
const selectedEntityId = ref<string | number | boolean | null>(null)

watch(
  () => platform.activeSchemas,
  (schemas) => {
    if (!selectedEntityId.value && schemas[0]) selectedEntityId.value = schemas[0].id
  },
  { immediate: true },
)

const entityOptions = computed(() =>
  platform.activeSchemas.map((schema) => ({
    label: schema.name,
    value: schema.id,
  })),
)

const selectedEntity = computed(() =>
  selectedEntityId.value ? platform.schemaById(String(selectedEntityId.value)) : undefined,
)

const entityDictionaries = computed(() =>
  platform.dictionaries.filter((dictionary) => dictionary.entityId === selectedEntity.value?.id),
)

const dictionaryRows = computed<Record<string, unknown>[]>(() =>
  entityDictionaries.value.map((dictionary) => ({
    id: dictionary.id,
    name: dictionary.name,
    items: dictionary.items.length,
    __dictionary: dictionary,
  })),
)

function open(row: Record<string, unknown>) {
  router.push(`/admin/dictionaries/${row.id}`)
}

async function addDictionary() {
  if (!selectedEntity.value) return
  const dictionary = platform.createNewDictionary('Новый справочник', selectedEntity.value.id)
  const saved = await platform.saveDictionary(dictionary)
  toast.add({ severity: 'success', summary: 'Справочник создан', detail: selectedEntity.value.name, life: 2200 })
  router.push(`/admin/dictionaries/${saved.id}`)
}
</script>

<template>
  <div>
    <UiPageHeader title="Справочники" description="Справочники теперь создаются и редактируются в контексте выбранной сущности.">
      <template #actions>
        <UiButton
          label="Добавить справочник"
          icon="pi pi-plus"
          :disabled="!selectedEntity"
          @click="addDictionary"
        />
      </template>
    </UiPageHeader>

    <section v-if="entityOptions.length === 0" class="panel">
      <UiEmptyState
        title="Нет сущностей для справочников"
        description="Справочники создаются внутри сущности. Сначала создайте и опубликуйте сущность."
      >
        <UiButton label="Создать сущность" icon="pi pi-plus" @click="router.push('/admin/entities/new')" />
      </UiEmptyState>
    </section>

    <section v-else class="panel stack">
      <div class="form-field">
        <label for="dictionary-entity">Сущность</label>
        <UiSelect
          id="dictionary-entity"
          v-model="selectedEntityId"
          :options="entityOptions"
          placeholder="Выберите сущность"
        />
      </div>

      <UiEmptyState
        v-if="selectedEntity && dictionaryRows.length === 0"
        title="У сущности пока нет справочников"
        description="Создайте справочник, затем подключите его к полю типа «Справочник» в конструкторе сущности."
      >
        <UiButton label="Добавить справочник" icon="pi pi-plus" @click="addDictionary" />
      </UiEmptyState>

      <UiTable
        v-else
        :rows="dictionaryRows"
        :columns="[
          { field: 'name', header: 'Название' },
          { field: 'items', header: 'Значений' },
        ]"
        empty-message="Выберите сущность"
        @row-click="open"
      >
        <template #cell="{ row, column }">
          <strong v-if="column.field === 'name'">{{ row.name }}</strong>
          <span v-else>{{ row[column.field] }}</span>
        </template>
      </UiTable>
    </section>
  </div>
</template>
