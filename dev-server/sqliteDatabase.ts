import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  AppDatabase,
  Attachment,
  AuditEvent,
  Dictionary,
  EntityObject,
  EntitySchema,
  GeoRule,
  Layer,
  Organization,
  Role,
  Task,
  User,
  UserSettings,
  Workflow,
} from '../src/shared/types/domain.js'

type CollectionName =
  | 'entitySchemas'
  | 'entityObjects'
  | 'dictionaries'
  | 'users'
  | 'roles'
  | 'organizations'
  | 'workflows'
  | 'tasks'
  | 'geoRules'
  | 'layers'
  | 'attachments'
  | 'auditEvents'
  | 'userSettings'

type CollectionItem =
  | EntitySchema
  | EntityObject
  | Dictionary
  | User
  | Role
  | Organization
  | Workflow
  | Task
  | GeoRule
  | Layer
  | Attachment
  | AuditEvent
  | UserSettings

interface CollectionConfig<T extends CollectionItem = CollectionItem> {
  key: CollectionName
  table: string
  idOf: (item: T) => string
}

interface SqliteRow {
  data: string
}

const DATA_DIR = path.resolve(process.cwd(), '.data')
const DB_PATH = path.join(DATA_DIR, 'low-code.sqlite')

const collections: CollectionConfig[] = [
  { key: 'entitySchemas', table: 'entity_schemas', idOf: (item) => (item as EntitySchema).id },
  { key: 'entityObjects', table: 'entity_objects', idOf: (item) => (item as EntityObject).id },
  { key: 'dictionaries', table: 'dictionaries', idOf: (item) => (item as Dictionary).id },
  { key: 'users', table: 'users', idOf: (item) => (item as User).id },
  { key: 'roles', table: 'roles', idOf: (item) => (item as Role).id },
  { key: 'organizations', table: 'organizations', idOf: (item) => (item as Organization).id },
  { key: 'workflows', table: 'workflows', idOf: (item) => (item as Workflow).id },
  { key: 'tasks', table: 'tasks', idOf: (item) => (item as Task).id },
  { key: 'geoRules', table: 'geo_rules', idOf: (item) => (item as GeoRule).id },
  { key: 'layers', table: 'layers', idOf: (item) => (item as Layer).id },
  { key: 'attachments', table: 'attachments', idOf: (item) => (item as Attachment).id },
  { key: 'auditEvents', table: 'audit_events', idOf: (item) => (item as AuditEvent).id },
  { key: 'userSettings', table: 'user_settings', idOf: (item) => (item as UserSettings).userId },
]

let connection: DatabaseSync | null = null

export function sqliteDatabasePath(): string {
  return DB_PATH
}

export function readSqliteDatabase(seedFactory: () => AppDatabase): AppDatabase {
  const db = openDatabase()
  const hasData = collections.some((collection) => {
    const row = db.prepare(`select count(*) as count from ${collection.table}`).get() as { count: number }
    return row.count > 0
  })

  if (!hasData) {
    const seed = seedFactory()
    writeSqliteDatabase(seed)
    return seed
  }

  return readFromTables(db, seedFactory())
}

export function writeSqliteDatabase(appDb: AppDatabase): AppDatabase {
  const db = openDatabase()
  db.exec('begin immediate transaction')
  try {
    writeToTables(db, appDb)
    db.exec('commit')
    return appDb
  } catch (cause) {
    db.exec('rollback')
    throw cause
  }
}

export function resetSqliteDatabase(seedFactory: () => AppDatabase): AppDatabase {
  const seed = seedFactory()
  return writeSqliteDatabase(seed)
}

function openDatabase(): DatabaseSync {
  if (connection) return connection
  mkdirSync(DATA_DIR, { recursive: true })
  connection = new DatabaseSync(DB_PATH)
  connection.exec('pragma journal_mode = WAL')
  connection.exec('pragma foreign_keys = ON')
  ensureSchema(connection)
  return connection
}

function ensureSchema(db: DatabaseSync): void {
  db.exec(`
    create table if not exists platform_settings (
      id text primary key,
      data text not null
    );
  `)

  collections.forEach((collection) => {
    db.exec(`
      create table if not exists ${collection.table} (
        id text primary key,
        position integer not null,
        data text not null
      );
      create index if not exists idx_${collection.table}_position on ${collection.table}(position);
    `)
  })
}

function readFromTables(db: DatabaseSync, fallback: AppDatabase): AppDatabase {
  const settingsRow = db
    .prepare('select data from platform_settings where id = ?')
    .get('platform') as SqliteRow | undefined

  return {
    entitySchemas: readCollection<EntitySchema>(db, 'entitySchemas'),
    entityObjects: readCollection<EntityObject>(db, 'entityObjects'),
    dictionaries: readCollection<Dictionary>(db, 'dictionaries'),
    users: readCollection<User>(db, 'users'),
    roles: readCollection<Role>(db, 'roles'),
    organizations: readCollection<Organization>(db, 'organizations'),
    workflows: readCollection<Workflow>(db, 'workflows'),
    tasks: readCollection<Task>(db, 'tasks'),
    geoRules: readCollection<GeoRule>(db, 'geoRules'),
    layers: readCollection<Layer>(db, 'layers'),
    attachments: readCollection<Attachment>(db, 'attachments'),
    auditEvents: readCollection<AuditEvent>(db, 'auditEvents'),
    settings: settingsRow ? JSON.parse(settingsRow.data) as AppDatabase['settings'] : fallback.settings,
    userSettings: readCollection<UserSettings>(db, 'userSettings'),
  }
}

function writeToTables(db: DatabaseSync, appDb: AppDatabase): void {
  db
    .prepare(`
      insert into platform_settings (id, data)
      values (?, ?)
      on conflict(id) do update set data = excluded.data
    `)
    .run('platform', JSON.stringify(appDb.settings))

  collections.forEach((collection) => {
    const items = appDb[collection.key] as CollectionItem[]
    db.prepare(`delete from ${collection.table}`).run()
    const insert = db.prepare(`insert into ${collection.table} (id, position, data) values (?, ?, ?)`)
    items.forEach((item, index) => {
      insert.run(collection.idOf(item), index + 1, JSON.stringify(item))
    })
  })
}

function readCollection<T extends CollectionItem>(db: DatabaseSync, key: CollectionName): T[] {
  const collection = collections.find((candidate) => candidate.key === key)
  if (!collection) return []
  const rows = db.prepare(`select data from ${collection.table} order by position asc`).all() as unknown as SqliteRow[]
  return rows.map((row) => JSON.parse(row.data) as T)
}
