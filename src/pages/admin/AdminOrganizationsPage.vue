<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import { createId } from '../../shared/lib/id'
import { usePlatformStore } from '../../stores/platform'
import type { Organization } from '../../shared/types/domain'

const toast = useToast()
const platform = usePlatformStore()
const selectedId = ref('')
const editable = ref<Organization | null>(null)

watch(
  () => platform.organizations,
  () => {
    if (!selectedId.value) selectedId.value = platform.organizations[0]?.id ?? ''
    const source = platform.organizations.find((org) => org.id === selectedId.value)
    editable.value = source ? { ...source } : null
  },
  { immediate: true, deep: true },
)

const treeRows = computed(() =>
  platform.organizations.map((org) => ({
    ...org,
    depth: org.parentId ? 1 : 0,
  })),
)
const parentOptions = computed(() => [
  { label: 'Без родителя', value: '' },
  ...platform.organizations.map((org) => ({ label: org.name, value: org.id })),
])

function select(id: string) {
  selectedId.value = id
  const source = platform.organizations.find((org) => org.id === id)
  editable.value = source ? { ...source } : null
}

function addOrganization() {
  editable.value = { id: createId('org'), name: 'Новая организация', parentId: 'org_city' }
}

async function save() {
  if (!editable.value) return
  await platform.saveOrganization({ ...editable.value, parentId: editable.value.parentId || undefined })
  selectedId.value = editable.value.id
  toast.add({ severity: 'success', summary: 'Организация сохранена', life: 2200 })
}
</script>

<template>
  <div>
    <UiPageHeader title="Организации" description="Иерархия муниципальных подразделений.">
      <template #actions>
        <UiButton label="Добавить" icon="pi pi-plus" @click="addOrganization" />
      </template>
    </UiPageHeader>
    <section class="split-layout">
      <div class="panel org-tree">
        <button
          v-for="org in treeRows"
          :key="org.id"
          type="button"
          :class="{ active: org.id === selectedId }"
          :style="{ paddingLeft: `${12 + org.depth * 24}px` }"
          @click="select(org.id)"
        >
          {{ org.depth ? '├ ' : '' }}{{ org.name }}
        </button>
      </div>
      <aside v-if="editable" class="panel stack">
        <div class="form-field"><label>Название</label><UiInput v-model="editable.name" /></div>
        <div class="form-field"><label>Parent</label><UiSelect v-model="editable.parentId" :options="parentOptions" /></div>
        <UiButton label="Сохранить" icon="pi pi-save" @click="save" />
      </aside>
    </section>
  </div>
</template>

<style scoped>
.org-tree {
  display: grid;
  align-content: start;
  gap: 4px;
}

.org-tree button {
  min-height: 38px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.org-tree button.active,
.org-tree button:hover {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
</style>
