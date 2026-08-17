import { createRouter, createWebHashHistory, createWebHistory, type RouterHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'
import AppLayout from '../layouts/AppLayout.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/app/dashboard' },
  {
    path: '/login',
    name: 'login',
    component: () => import('../../pages/login/LoginPage.vue'),
  },
  {
    path: '/app',
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/app/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('../../pages/dashboard/DashboardPage.vue') },
      { path: 'map', name: 'global-map', component: () => import('../../pages/map/GlobalMapPage.vue') },
      {
        path: 'entities/:entityCode',
        name: 'entity-registry',
        component: () => import('../../pages/entity/EntityRegistryPage.vue'),
      },
      {
        path: 'entities/:entityCode/new',
        name: 'entity-create',
        component: () => import('../../pages/entity/EntityCreatePage.vue'),
      },
      {
        path: 'entities/:entityCode/:objectId',
        name: 'entity-details',
        component: () => import('../../pages/entity/EntityDetailsPage.vue'),
      },
      { path: 'tasks', name: 'tasks', component: () => import('../../pages/tasks/TasksPage.vue') },
      { path: 'analytics', name: 'analytics', component: () => import('../../pages/analytics/AnalyticsPage.vue') },
    ],
  },
  {
    path: '/admin',
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/admin/home' },
      { path: 'home', name: 'settings-home', component: () => import('../../pages/settings/HomeSettingsPage.vue') },
      {
        path: 'entities',
        name: 'admin-entities',
        component: () => import('../../pages/admin/AdminEntitiesPage.vue'),
        meta: { requiresSystemPermission: true },
      },
      {
        path: 'entities/new',
        name: 'admin-entity-create',
        component: () => import('../../pages/admin/AdminEntityCreatePage.vue'),
        meta: { requiresSystemPermission: true },
      },
      {
        path: 'entities/:id',
        name: 'admin-entity-builder',
        component: () => import('../../pages/admin/AdminEntityBuilderPage.vue'),
        meta: { requiresSystemPermission: true },
      },
      {
        path: 'dictionaries',
        name: 'admin-dictionaries',
        component: () => import('../../pages/admin/AdminDictionariesPage.vue'),
        meta: { requiresSystemPermission: true },
      },
      {
        path: 'dictionaries/:id',
        name: 'admin-dictionary-details',
        component: () => import('../../pages/admin/AdminDictionaryDetailsPage.vue'),
        meta: { requiresSystemPermission: true },
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('../../pages/admin/AdminUsersPage.vue'),
        meta: { requiresSystemPermission: true },
      },
      {
        path: 'users/:id',
        name: 'admin-user-details',
        component: () => import('../../pages/admin/AdminUsersPage.vue'),
        meta: { requiresSystemPermission: true },
      },
      {
        path: 'roles',
        name: 'admin-roles',
        component: () => import('../../pages/admin/AdminRolesPage.vue'),
        meta: { requiresSystemPermission: true },
      },
      {
        path: 'roles/:id',
        name: 'admin-role-details',
        component: () => import('../../pages/admin/AdminRolesPage.vue'),
        meta: { requiresSystemPermission: true },
      },
      {
        path: 'organizations',
        name: 'admin-organizations',
        component: () => import('../../pages/admin/AdminOrganizationsPage.vue'),
        meta: { requiresSystemPermission: true },
      },
      {
        path: 'import',
        name: 'admin-import',
        component: () => import('../../pages/admin/AdminImportPage.vue'),
        meta: { requiresSystemPermission: true },
      },
      {
        path: 'api',
        name: 'admin-api',
        component: () => import('../../pages/admin/AdminApiPage.vue'),
        meta: { requiresSystemPermission: true },
      },
      {
        path: 'settings',
        name: 'admin-settings',
        component: () => import('../../pages/admin/AdminSettingsPage.vue'),
        meta: { requiresSystemPermission: true },
      },
    ],
  },
]

export const router = createRouter({
  history: createRouterHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const platform = usePlatformStore()
  await auth.hydrate()
  if (!platform.settings) await platform.refresh()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresSystemPermission && !hasSystemAccess()) {
    return { name: 'settings-home' }
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }

  return true
})

function hasSystemAccess(): boolean {
  const auth = useAuthStore()
  const platform = usePlatformStore()
  const roleIds = auth.currentUser?.roleIds ?? []
  return platform.roles
    .filter((role) => roleIds.includes(role.id))
    .some((role) => role.permissions.some((permission) => permission.system && permission.view))
}

function createRouterHistory(): RouterHistory {
  return import.meta.env.VITE_ROUTER_MODE === 'hash'
    ? createWebHashHistory(import.meta.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL)
}
