<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArrowLeft,
  Braces,
  Building2,
  Database,
  FileInput,
  GitBranch,
  Home,
  ListChecks,
  Map,
  MapPinned,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  Users,
} from '@lucide/vue'
import { usePlatformStore } from '../../stores/platform'
import { usePermissions } from '../../shared/lib/usePermissions'
import type { EntitySchema } from '../../shared/types/domain'

const props = defineProps<{
  mode: 'runtime' | 'settings'
}>()

const collapsed = defineModel<boolean>('collapsed', { default: false })
const platform = usePlatformStore()
const permissions = usePermissions()

const runtimeUtilityItems = [
  { label: 'Главная', to: '/app/dashboard', icon: Home },
  { label: 'Карта', to: '/app/map', icon: Map },
]

const adminItems = [
  { label: 'Сущности', to: '/admin/entities', icon: Database },
  { label: 'Справочники', to: '/admin/dictionaries', icon: ListChecks },
  { label: 'Пользователи', to: '/admin/users', icon: Users },
  { label: 'Роли', to: '/admin/roles', icon: Shield },
  { label: 'Организации', to: '/admin/organizations', icon: Building2 },
  { label: 'Импорт', to: '/admin/import', icon: FileInput },
  { label: 'API', to: '/admin/api', icon: Braces },
  { label: 'Платформа', to: '/admin/settings', icon: Settings },
]

const userSettingsItems = [
  { label: 'Главный экран', to: '/admin/home', icon: Home },
]

const canOpenSystemSettings = computed(() => permissions.can('view'))
const brandTitle = computed(() => platform.settings?.municipalityName?.trim() || 'Муниципалитет')
const brandEyebrow = computed(() => platform.settings?.platformName?.trim() || 'Муниципальная платформа')
const brandInitial = computed(() => firstBrandLetter(brandTitle.value || brandEyebrow.value))

const runtimeEntityItems = computed(() =>
  platform.runtimeSchemas
    .filter((schema: EntitySchema) => permissions.can('view', schema.id))
    .map((schema: EntitySchema) => ({
      label: schema.name,
      to: `/app/entities/${schema.code}`,
      icon: schema.geometryType === 'point' ? MapPinned : GitBranch,
    })),
)

function firstBrandLetter(value: string): string {
  return Array.from(value.trim()).find((char) => /[\p{L}\p{N}]/u.test(char))?.toLocaleUpperCase('ru-RU') ?? 'М'
}
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': collapsed }">
    <div class="sidebar__brand">
      <p v-if="!collapsed" class="sidebar__eyebrow">{{ brandEyebrow }}</p>
      <h1 v-if="!collapsed">{{ brandTitle }}</h1>
      <span v-else aria-hidden="true">{{ brandInitial }}</span>
    </div>

    <button
      class="sidebar__collapse"
      type="button"
      :aria-label="collapsed ? 'Раскрыть меню' : 'Скрыть меню'"
      @click="collapsed = !collapsed"
    >
      <PanelLeftOpen v-if="collapsed" :size="17" />
      <PanelLeftClose v-else :size="17" />
      <span v-if="!collapsed">Скрыть</span>
    </button>

    <nav v-if="mode === 'runtime'" class="sidebar__nav sidebar__nav--runtime" aria-label="Навигация приложения">
      <div class="sidebar__section sidebar__section--utility">
        <RouterLink
          v-for="item in runtimeUtilityItems"
          :key="item.to"
          :to="item.to"
          class="sidebar__link sidebar__link--utility"
        >
          <component :is="item.icon" :size="17" />
          <span v-if="!collapsed">{{ item.label }}</span>
        </RouterLink>
      </div>

      <div class="sidebar__section sidebar__section--entities">
        <p v-if="runtimeEntityItems.length === 0 && !collapsed" class="sidebar__empty">Сущностей нет</p>
        <RouterLink
          v-for="item in runtimeEntityItems"
          :key="item.to"
          :to="item.to"
          class="sidebar__link sidebar__link--entity"
        >
          <component :is="item.icon" :size="17" />
          <span v-if="!collapsed">{{ item.label }}</span>
        </RouterLink>
      </div>
    </nav>

    <nav v-else class="sidebar__nav sidebar__nav--settings" aria-label="Настройки">
      <div class="sidebar__section sidebar__section--user-settings">
        <p v-if="!collapsed" class="sidebar__group-label">Настройки пользователя</p>
        <RouterLink v-for="item in userSettingsItems" :key="item.to" :to="item.to" class="sidebar__link">
          <component :is="item.icon" :size="17" />
          <span v-if="!collapsed">{{ item.label }}</span>
        </RouterLink>
      </div>

      <div v-if="canOpenSystemSettings" class="sidebar__section sidebar__section--system-settings">
        <p v-if="!collapsed" class="sidebar__group-label">Настройки системы</p>
        <RouterLink v-for="item in adminItems" :key="item.to" :to="item.to" class="sidebar__link">
          <component :is="item.icon" :size="17" />
          <span v-if="!collapsed">{{ item.label }}</span>
        </RouterLink>
      </div>
    </nav>

    <div class="sidebar__bottom">
      <RouterLink v-if="mode === 'runtime'" to="/admin/home" class="sidebar__link sidebar__link--settings">
        <Settings :size="17" />
        <span v-if="!collapsed">Настройки</span>
      </RouterLink>

      <RouterLink v-else to="/app/dashboard" class="sidebar__link sidebar__link--settings">
        <ArrowLeft :size="17" />
        <span v-if="!collapsed">Назад</span>
      </RouterLink>
    </div>
  </aside>
</template>
