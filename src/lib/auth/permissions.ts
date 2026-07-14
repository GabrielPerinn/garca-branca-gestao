export const permissions = [
  'read',
  'operations.write',
  'finance.write',
  'people.write',
  'actions.approve',
  'settings.write',
] as const

export type Permission = (typeof permissions)[number]
export type AppRole = 'owner' | 'admin' | 'manager' | 'operator' | 'viewer'

const rolePermissions: Record<AppRole, ReadonlySet<Permission>> = {
  owner: new Set(permissions),
  admin: new Set(permissions),
  manager: new Set([
    'read',
    'operations.write',
    'finance.write',
    'people.write',
    'actions.approve',
  ]),
  operator: new Set(['read', 'operations.write']),
  viewer: new Set(['read']),
}

/**
 * `user` was the original role assigned by the database. Treating it as a
 * manager preserves existing installations while all new roles are explicit.
 */
export function normalizeRole(role: string | null | undefined): AppRole {
  const normalized = role?.trim().toLowerCase()
  if (normalized === 'owner' || normalized === 'admin' || normalized === 'manager') {
    return normalized
  }
  if (normalized === 'operator') return 'operator'
  if (normalized === 'viewer') return 'viewer'
  if (normalized === 'user') return 'manager'
  return 'viewer'
}

export function hasPermission(
  role: string | null | undefined,
  permission: Permission,
): boolean {
  return rolePermissions[normalizeRole(role)].has(permission)
}

export function permissionLabel(permission: Permission): string {
  const labels: Record<Permission, string> = {
    read: 'consultar dados',
    'operations.write': 'alterar dados operacionais',
    'finance.write': 'alterar dados financeiros',
    'people.write': 'alterar dados da equipe',
    'actions.approve': 'aprovar ações',
    'settings.write': 'alterar configurações',
  }
  return labels[permission]
}
