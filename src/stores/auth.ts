import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { repositories } from '../shared/api/repositories'
import type { User } from '../shared/types/domain'

const AUTH_KEY = 'low-code-gis-auth-user-id'

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<User | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const isAuthenticated = computed(() => currentUser.value !== null)

  async function hydrate(): Promise<void> {
    const userId = localStorage.getItem(AUTH_KEY)
    if (!userId || currentUser.value?.id === userId) return
    const users = await repositories.users.list()
    currentUser.value = users.find((user) => user.id === userId) ?? null
  }

  async function login(loginValue: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const user = await repositories.users.authenticate(loginValue, password)
      if (!user) {
        error.value = 'Неверный логин или пароль'
        return false
      }
      currentUser.value = user
      localStorage.setItem(AUTH_KEY, user.id)
      return true
    } finally {
      loading.value = false
    }
  }

  function logout(): void {
    currentUser.value = null
    localStorage.removeItem(AUTH_KEY)
  }

  return { currentUser, loading, error, isAuthenticated, hydrate, login, logout }
})
