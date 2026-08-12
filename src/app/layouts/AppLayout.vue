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

const mode = computed(() => (route.path.startsWith('/admin') ? 'admin' : 'runtime'))
const title = computed(() => platform.settings?.platformName ?? 'Муниципальная платформа')

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
        <div>
          <p class="topbar__eyebrow">{{ title }}</p>
          <h1>{{ platform.settings?.municipalityName ?? 'Нижний Новгород' }}</h1>
        </div>
        <div class="topbar__actions">
          <button class="icon-button" type="button" aria-label="Выйти" @click="logout">
            <LogOut :size="18" />
          </button>
        </div>
      </header>
      <main class="content-surface">
        <RouterView />
      </main>
    </div>
  </div>
</template>
