import { computed } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { usePlatformStore } from '../../stores/platform'

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'transition'

export function usePermissions() {
  const auth = useAuthStore()
  const platform = usePlatformStore()

  const userRoles = computed(() => {
    const roleIds = auth.currentUser?.roleIds ?? []
    return platform.roles.filter((role) => roleIds.includes(role.id))
  })

  const isAdmin = computed(() =>
    userRoles.value.some((role) => role.permissions.some((permission) => permission.system === '*')),
  )

  function can(action: PermissionAction, entityId?: string): boolean {
    if (!auth.currentUser) return false
    if (isAdmin.value) return true
    if (!entityId) return userRoles.value.some((role) => role.permissions.some((permission) => permission.system))
    return userRoles.value.some((role) =>
      role.permissions.some((permission) => permission.entityId === entityId && permission[action]),
    )
  }

  function canUseTransition(allowedRoleIds: string[]): boolean {
    if (isAdmin.value) return true
    return userRoles.value.some((role) => allowedRoleIds.includes(role.id))
  }

  return { userRoles, isAdmin, can, canUseTransition }
}
