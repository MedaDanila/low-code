import type {
  AppDatabase,
  Organization,
  PlatformSettings,
  Role,
  User,
  UserSettings,
} from '../types/domain.js'

const organizations: Organization[] = [
  { id: 'org_system', name: 'Система' },
]

const roles: Role[] = [
  {
    id: 'role_admin',
    code: 'admin',
    name: 'Администратор',
    permissions: [{ system: '*', view: true, create: true, edit: true, delete: true, transition: true }],
  },
]

const users: User[] = [
  {
    id: 'usr_admin',
    login: 'admin',
    password: 'admin',
    lastName: 'Администратор',
    firstName: 'Системы',
    organizationId: 'org_system',
    roleIds: ['role_admin'],
    status: 'active',
  },
]

const settings: PlatformSettings = {
  platformName: 'Муниципальная платформа',
  municipalityName: 'Муниципалитет',
  mapCenter: [44.0065, 56.3269],
  mapZoom: 12,
  sessionTimeoutMinutes: 60,
  dateTimeFormat: 'dd.MM.yyyy HH:mm',
}

export function createSeedDatabase(): AppDatabase {
  return {
    entitySchemas: [],
    entityObjects: [],
    dictionaries: [],
    users,
    roles,
    organizations,
    workflows: [],
    tasks: [],
    geoRules: [],
    layers: [],
    attachments: [],
    auditEvents: [],
    settings,
    userSettings: users.map((user) => defaultUserSettings(user.id)),
  }
}

function defaultUserSettings(userId: string): UserSettings {
  return {
    userId,
    home: {
      summaryBlocks: [],
    },
  }
}
