<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Building2,
  Database,
  FileInput,
  GitBranch,
  Home,
  Layers,
  ListChecks,
  Map,
  MapPinned,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  Users,
  Workflow,
} from '@lucide/vue'
import { usePlatformStore } from '../../stores/platform'
import { usePermissions } from '../../shared/lib/usePermissions'
import type { EntitySchema } from '../../shared/types/domain'

const props = defineProps<{
  mode: 'runtime' | 'admin'
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
  { label: 'Процессы', to: '/admin/workflows', icon: Workflow },
  { label: 'Гео-правила', to: '/admin/geo-rules', icon: Network },
  { label: 'Слои', to: '/admin/layers', icon: Layers },
  { label: 'Пользователи', to: '/admin/users', icon: Users },
  { label: 'Роли', to: '/admin/roles', icon: Shield },
  { label: 'Организации', to: '/admin/organizations', icon: Building2 },
  { label: 'Импорт', to: '/admin/import', icon: FileInput },
  { label: 'Настройки', to: '/admin/settings', icon: Settings },
]

const runtimeEntityItems = computed(() =>
  platform.runtimeSchemas
    .filter((schema: EntitySchema) => permissions.can('view', schema.id))
    .map((schema: EntitySchema) => ({
      label: schema.name,
      to: `/app/entities/${schema.code}`,
      icon: schema.geometryType === 'point' ? MapPinned : GitBranch,
    })),
)
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': collapsed }">
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

    <nav v-if="mode === 'runtime'" class="sidebar__nav" aria-label="Runtime навигация">
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

    <nav v-else class="sidebar__nav" aria-label="Administration навигация">
      <RouterLink v-for="item in adminItems" :key="item.to" :to="item.to" class="sidebar__link">
        <component :is="item.icon" :size="17" />
        <span v-if="!collapsed">{{ item.label }}</span>
      </RouterLink>
    </nav>
  </aside>
</template>
