<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Checkbox from 'primevue/checkbox'
import { useToast } from 'primevue/usetoast'
import UiButton from '../../shared/ui/UiButton.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTable from '../../shared/ui/UiTable.vue'
import { createId } from '../../shared/lib/id'
import { usePlatformStore } from '../../stores/platform'
import type { User } from '../../shared/types/domain'

const toast = useToast()
const platform = usePlatformStore()
const selectedId = ref('')
const editable = ref<User | null>(null)

watch(
  () => platform.users,
  () => {
    if (!selectedId.value) selectedId.value = platform.users[0]?.id ?? ''
    const source = platform.users.find((user) => user.id === selectedId.value)
    editable.value = source ? JSON.parse(JSON.stringify(source)) as User : null
  },
  { immediate: true, deep: true },
)

const rows = computed<Record<string, unknown>[]>(() =>
  platform.users.map((user) => ({
    id: user.id,
    name: `${user.lastName} ${user.firstName}`,
    login: user.login,
    organization: platform.organizations.find((org) => org.id === user.organizationId)?.name,
    roles: user.roleIds.map((id) => platform.roleById(id)?.name).filter(Boolean).join(', '),
    status: userStatusLabels[user.status] ?? user.status,
  })),
)

const userStatusLabels: Record<string, string> = {
  active: 'Активен',
  blocked: 'Заблокирован',
}

const organizationOptions = computed(() => platform.organizations.map((org) => ({ label: org.name, value: org.id })))

function select(row: Record<string, unknown>) {
  selectedId.value = String(row.id)
  const source = platform.users.find((user) => user.id === selectedId.value)
  editable.value = source ? JSON.parse(JSON.stringify(source)) as User : null
}

function createUser() {
  editable.value = {
    id: createId('usr'),
    login: 'new.user',
    password: 'password',
    lastName: 'Новый',
    firstName: 'Пользователь',
    organizationId: platform.organizations[0]?.id ?? '',
    roleIds: [],
    status: 'active',
  }
}

async function save() {
  if (!editable.value) return
  await platform.saveUser(editable.value)
  selectedId.value = editable.value.id
  toast.add({ severity: 'success', summary: 'Пользователь сохранён', life: 2200 })
}
</script>

<template>
  <div>
    <UiPageHeader title="Пользователи" description="Учётные записи, организации и роли.">
      <template #actions>
        <UiButton label="Создать" icon="pi pi-plus" @click="createUser" />
      </template>
    </UiPageHeader>
    <section class="split-layout">
      <div class="panel">
        <UiTable
          :rows="rows"
          :columns="[
            { field: 'name', header: 'ФИО' },
            { field: 'login', header: 'Логин' },
            { field: 'organization', header: 'Организация' },
            { field: 'roles', header: 'Роли' },
            { field: 'status', header: 'Статус' },
          ]"
          @row-click="select"
        />
      </div>
      <aside v-if="editable" class="panel stack">
        <div class="form-grid">
          <div class="form-field"><label>Фамилия</label><UiInput v-model="editable.lastName" /></div>
          <div class="form-field"><label>Имя</label><UiInput v-model="editable.firstName" /></div>
          <div class="form-field"><label>Отчество</label><UiInput v-model="editable.middleName" /></div>
          <div class="form-field"><label>Логин</label><UiInput v-model="editable.login" /></div>
          <div class="form-field"><label>Организация</label><UiSelect v-model="editable.organizationId" :options="organizationOptions" /></div>
          <div class="form-field"><label>Статус</label><UiSelect v-model="editable.status" :options="[{ label: 'Активен', value: 'active' }, { label: 'Заблокирован', value: 'blocked' }]" /></div>
        </div>
        <div class="stack">
          <span class="muted">Роли</span>
          <label v-for="role in platform.roles" :key="role.id">
            <Checkbox
              :model-value="editable.roleIds.includes(role.id)"
              binary
              @update:model-value="
                editable!.roleIds = Boolean($event)
                  ? [...editable!.roleIds, role.id]
                  : editable!.roleIds.filter((id) => id !== role.id)
              "
            />
            {{ role.name }}
          </label>
        </div>
        <UiButton label="Сохранить" icon="pi pi-save" @click="save" />
      </aside>
    </section>
  </div>
</template>
