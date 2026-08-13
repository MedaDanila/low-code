<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Checkbox from 'primevue/checkbox'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiEmptyState from '../../shared/ui/UiEmptyState.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { usePlatformStore } from '../../stores/platform'
import type { Permission, Role } from '../../shared/types/domain'

const toast = useToast()
const platform = usePlatformStore()
const selectedId = ref('')
const editable = ref<Role | null>(null)

watch(
  () => platform.roles,
  () => {
    if (!selectedId.value) selectedId.value = platform.roles[0]?.id ?? ''
    const source = platform.roles.find((role) => role.id === selectedId.value)
    editable.value = source ? JSON.parse(JSON.stringify(source)) as Role : null
  },
  { immediate: true, deep: true },
)

const rows = computed<Record<string, unknown>[]>(() =>
  platform.roles.map((role) => ({ id: role.id, name: role.name, permissions: role.permissions.length })),
)

const entityPermissions = computed(() =>
  platform.activeSchemas.map((schema) => ({
    schema,
    permission: permissionFor(schema.id),
  })),
)

function select(row: Record<string, unknown>) {
  selectedId.value = String(row.id)
  const source = platform.roles.find((role) => role.id === selectedId.value)
  editable.value = source ? JSON.parse(JSON.stringify(source)) as Role : null
}

function permissionFor(entityId: string): Permission {
  if (!editable.value) return emptyPermission(entityId)
  let permission = editable.value.permissions.find((item) => item.entityId === entityId)
  if (!permission) {
    permission = emptyPermission(entityId)
    editable.value.permissions.push(permission)
  }
  return permission
}

function emptyPermission(entityId: string): Permission {
  return { entityId, view: false, create: false, edit: false, delete: false, transition: false }
}

async function save() {
  if (!editable.value) return
  await platform.saveRole(editable.value)
  toast.add({ severity: 'success', summary: 'Роль сохранена', life: 2200 })
}
</script>

<template>
  <div>
    <UiPageHeader title="Роли" description="Системные права и права по сущностям." />
    <section class="split-layout">
      <div class="panel">
        <UiTable
          :rows="rows"
          :columns="[
            { field: 'name', header: 'Роль' },
            { field: 'permissions', header: 'Права' },
          ]"
          @row-click="select"
        />
      </div>
      <aside v-if="editable" class="panel stack">
        <div class="form-grid">
          <div class="form-field"><label>Название</label><UiInput v-model="editable.name" /></div>
        </div>
        <h3 class="surface-title">Права по сущностям</h3>
        <UiEmptyState
          v-if="entityPermissions.length === 0"
          title="Сущностей пока нет"
          description="Права по сущностям появятся после создания и публикации сущностей."
        />
        <table v-else class="permission-table">
          <thead>
            <tr>
              <th>Сущность</th><th>Просмотр</th><th>Создание</th><th>Редактирование</th><th>Удаление</th><th>Переход</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in entityPermissions" :key="row.schema.id">
              <td>{{ row.schema.name }}</td>
              <td><Checkbox v-model="row.permission.view" binary /></td>
              <td><Checkbox v-model="row.permission.create" binary /></td>
              <td><Checkbox v-model="row.permission.edit" binary /></td>
              <td><Checkbox v-model="row.permission.delete" binary /></td>
              <td><Checkbox v-model="row.permission.transition" binary /></td>
            </tr>
          </tbody>
        </table>
        <UiButton label="Сохранить" icon="pi pi-save" @click="save" />
      </aside>
    </section>
  </div>
</template>

<style scoped>
.permission-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  padding: 9px;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

th {
  color: var(--color-text-secondary);
  font-size: 12px;
}
</style>
