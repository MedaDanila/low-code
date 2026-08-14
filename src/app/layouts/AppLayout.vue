<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LogOut } from '@lucide/vue'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import AppSidebar from '../../widgets/app-sidebar/AppSidebar.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const platform = usePlatformStore()
const sidebarCollapsed = ref(false)

const mode = computed(() => (route.path.startsWith('/admin') ? 'settings' : 'runtime'))
const currentEntity = computed(() => {
  if (typeof route.params.entityCode === 'string') {
    return platform.schemaByCode(route.params.entityCode)
  }

  if (route.name === 'admin-entity-builder' && typeof route.params.id === 'string') {
    return platform.schemaById(route.params.id)
  }

  return undefined
})
const topbarTitle = computed(() => {
  if (currentEntity.value) return currentEntity.value.name
  if (route.name === 'dashboard' || route.name === 'settings-home') return 'Главная'
  if (route.name === 'global-map') return 'Карта'

  return platform.settings?.municipalityName ?? 'Муниципалитет'
})
const topbarDescription = computed(() => currentEntity.value?.description ?? '')

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--collapsed': sidebarCollapsed }">
    <AppSidebar v-model:collapsed="sidebarCollapsed" :mode="mode" />
    <div class="app-main">
      <header class="topbar">
        <div class="topbar__heading">
          <h1>{{ topbarTitle }}</h1>
          <p v-if="topbarDescription" class="topbar__description">{{ topbarDescription }}</p>
        </div>
        <div class="topbar__actions">
          <button class="icon-button" type="button" aria-label="Выйти" @click="logout">
            <LogOut :size="18" />
          </button>
        </div>
      </header>
      <main class="content-surface" :class="{ 'content-surface--map': route.name === 'global-map' }">
        <RouterView />
      </main>
    </div>
  </div>
</template>
