import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
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
      { path: '', redirect: '/admin/entities' },
      { path: 'entities', name: 'admin-entities', component: () => import('../../pages/admin/AdminEntitiesPage.vue') },
      { path: 'entities/new', name: 'admin-entity-create', component: () => import('../../pages/admin/AdminEntityCreatePage.vue') },
      { path: 'entities/:id', name: 'admin-entity-builder', component: () => import('../../pages/admin/AdminEntityBuilderPage.vue') },
      { path: 'dictionaries', name: 'admin-dictionaries', component: () => import('../../pages/admin/AdminDictionariesPage.vue') },
      { path: 'dictionaries/:id', name: 'admin-dictionary-details', component: () => import('../../pages/admin/AdminDictionaryDetailsPage.vue') },
      { path: 'workflows', name: 'admin-workflows', component: () => import('../../pages/admin/AdminWorkflowsPage.vue') },
      { path: 'workflows/:id', name: 'admin-workflow-builder', component: () => import('../../pages/admin/AdminWorkflowBuilderPage.vue') },
      { path: 'geo-rules', name: 'admin-geo-rules', component: () => import('../../pages/admin/AdminGeoRulesPage.vue') },
      { path: 'geo-rules/new', name: 'admin-geo-rule-create', component: () => import('../../pages/admin/AdminGeoRuleBuilderPage.vue') },
      { path: 'geo-rules/:id', name: 'admin-geo-rule-builder', component: () => import('../../pages/admin/AdminGeoRuleBuilderPage.vue') },
      { path: 'layers', name: 'admin-layers', component: () => import('../../pages/admin/AdminLayersPage.vue') },
      { path: 'users', name: 'admin-users', component: () => import('../../pages/admin/AdminUsersPage.vue') },
      { path: 'users/:id', name: 'admin-user-details', component: () => import('../../pages/admin/AdminUsersPage.vue') },
      { path: 'roles', name: 'admin-roles', component: () => import('../../pages/admin/AdminRolesPage.vue') },
      { path: 'roles/:id', name: 'admin-role-details', component: () => import('../../pages/admin/AdminRolesPage.vue') },
      { path: 'organizations', name: 'admin-organizations', component: () => import('../../pages/admin/AdminOrganizationsPage.vue') },
      { path: 'import', name: 'admin-import', component: () => import('../../pages/admin/AdminImportPage.vue') },
      { path: 'settings', name: 'admin-settings', component: () => import('../../pages/admin/AdminSettingsPage.vue') },
    ],
  },
]

export const router = createRouter({
  history: createWebHistory(),
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

  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }

  return true
})
