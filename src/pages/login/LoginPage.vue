<script setup lang="ts">
import { computed, ref } from 'vue'
import Checkbox from 'primevue/checkbox'
import { useRoute, useRouter } from 'vue-router'
import UiButton from '../../shared/ui/UiButton.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import { useAuthStore } from '../../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const login = ref('admin')
const password = ref('admin')
const remember = ref(true)
const redirectTo = computed(() => String(route.query.redirect ?? '/app/dashboard'))

async function submit() {
  const ok = await auth.login(String(login.value), String(password.value))
  if (ok) router.push(redirectTo.value)
}
</script>

<template>
  <main class="login-page">
    <section class="login-card">
      <div>
        <span class="brand-mark">GIS</span>
        <p class="eyebrow">Low-code municipal workspace</p>
        <h1>Вход в платформу</h1>
      </div>
      <form class="stack" @submit.prevent="submit">
        <div class="form-field">
          <label for="login">Логин</label>
          <UiInput id="login" v-model="login" placeholder="admin" />
        </div>
        <div class="form-field">
          <label for="password">Пароль</label>
          <input id="password" v-model="password" class="password-input" type="password" placeholder="admin" />
        </div>
        <div class="login-card__row">
          <label class="remember">
            <Checkbox v-model="remember" binary />
            <span>Запомнить меня</span>
          </label>
          <a href="#">Забыли пароль?</a>
        </div>
        <p v-if="auth.error" class="login-error">{{ auth.error }}</p>
        <UiButton label="Войти" type="submit" icon="pi pi-sign-in" :loading="auth.loading" />
      </form>
      <div class="demo-accounts">
        <span>Demo accounts</span>
        <code>admin/admin</code>
        <code>operator/operator</code>
        <code>manager/manager</code>
        <code>viewer/viewer</code>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
  background:
    linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(16, 185, 129, 0.06)),
    var(--color-background);
}

.login-card {
  width: 430px;
  display: grid;
  gap: 24px;
  padding: 30px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-overlay);
}

h1 {
  margin: 8px 0 0;
  font-size: 28px;
  letter-spacing: 0;
}

.password-input {
  width: 100%;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.login-card__row,
.remember,
.demo-accounts {
  display: flex;
  align-items: center;
  gap: 8px;
}

.login-card__row {
  justify-content: space-between;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.login-card__row a {
  color: var(--color-accent);
  font-weight: 650;
}

.login-error {
  margin: 0;
  color: var(--color-danger);
}

.demo-accounts {
  flex-wrap: wrap;
  padding-top: 4px;
  color: var(--color-text-secondary);
}

code {
  padding: 3px 7px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
  color: var(--color-text);
  font-size: 12px;
}
</style>
