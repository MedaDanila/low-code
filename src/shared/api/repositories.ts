import { createId, nowIso } from '../lib/id'
import { uniqueSystemCode } from '../lib/codegen'
import {
  distanceBetweenGeometriesMeters,
  geometriesIntersect,
} from '../lib/geometry'
import {
  objectDataStatusFromIssues,
  validateEntityObjectData,
} from '../lib/entityObjectValidation'
import type {
  AppDatabase,
  Attachment,
  AuditEvent,
  DashboardFilter,
  DashboardFilterGroup,
  DashboardSummaryBlock,
  DashboardThenAction,
  Dictionary,
  DictionaryItem,
  EntityObject,
  EntityObjectValues,
  EntityMapSettings,
  EntityMapStyle,
  EntitySchema,
  GeoRule,
  GeoValidationResult,
  GeometryType,
  Layer,
  Organization,
  PlatformSettings,
  Role,
  User,
  UserSettings,
  Workflow,
} from '../types/domain'
import { createSeedDatabase } from './seed'

const STORAGE_KEY = 'low-code-gis-platform-db-v1'
const SQLITE_MIGRATION_KEY = `${STORAGE_KEY}-sqlite-migrated-v1`
const SQLITE_DATABASE_ENDPOINT = '/api/v1/__runtime/database'
const STATIC_STORAGE_ENABLED = import.meta.env.VITE_STATIC_STORAGE === 'true'
const latencyRange = [220, 480] as const
const SUMMARY_WIDTH_STEP_PX = 10
const SUMMARY_DEFAULT_WIDTH_PX = 220
const DEMO_ENTITY_IDS = new Set(['ent_orders', 'ent_warranty', 'ent_playgrounds'])
const DEMO_ENTITY_CODES = new Set(['orders', 'warranty_areas', 'playgrounds'])
const DEMO_DICTIONARY_IDS = new Set(['dict_work_types', 'dict_playground_condition', 'dict_parking_type'])
const DEMO_DICTIONARY_CODES = new Set(['work_types', 'playground_condition', 'parking_type'])
const DEMO_USER_IDS = new Set(['usr_operator', 'usr_manager', 'usr_viewer'])
const DEMO_ROLE_IDS = new Set(['role_operator', 'role_manager', 'role_viewer'])
const DEMO_ORGANIZATION_IDS = new Set(['org_city', 'org_ati', 'org_transport', 'org_housing', 'org_property'])
const DEMO_WORKFLOW_IDS = new Set(['wf_orders'])
const DEMO_GEO_RULE_IDS = new Set(['geo_warranty_intersects'])
const DEMO_LAYER_IDS = new Set(['layer_orders', 'layer_warranty', 'layer_playgrounds'])
const DEMO_TASK_IDS = new Set(['task_order_1441'])
const DEMO_ATTACHMENT_IDS = new Set(['att_1', 'att_2', 'att_3', 'att_4'])
const DEMO_AUDIT_IDS = new Set(['aud_1', 'aud_2', 'aud_3', 'aud_4'])
const LEGACY_SUMMARY_WIDTHS: Record<string, number> = {
  small: 220,
  medium: 460,
  large: 940,
}

type StoredSummaryBlock = Omit<DashboardSummaryBlock, 'widthPx'> & {
  widthPx?: number
  width?: keyof typeof LEGACY_SUMMARY_WIDTHS
  thenAction?: DashboardThenAction
  filterGroups?: DashboardFilterGroup[]
}

type StoredMapSettings = Partial<Omit<EntityMapSettings, 'styles'>> & {
  style?: Partial<EntityMapStyle>
  styles?: Partial<Record<EntityMapSettings['enabledGeometryTypes'][number], Partial<EntityMapStyle>>>
}

export interface CreateEntitySchemaInput {
  name: string
  code?: string
  description?: string
  geometryType?: GeometryType
  includeAddress?: boolean
}

export interface CreateEntityObjectInput {
  entityId: string
  values: EntityObjectValues
  geometry?: EntityObject['geometry']
  status?: string
  actorId: string
}

export interface UpdateEntityObjectInput {
  id: string
  values: EntityObjectValues
  geometry?: EntityObject['geometry']
  actorId: string
}

export const repositories = {
  database: {
    async reset() {
      await writeDb(createSeedDatabase())
      await delay()
      return readDb()
    },
    async snapshot() {
      await delay()
      return readDb()
    },
  },

  entitySchemas: {
    async list() {
      await delay()
      return (await readDb()).entitySchemas
    },
    async listActive() {
      await delay()
      return (await readDb()).entitySchemas.filter((schema) => schema.status === 'active')
    },
    async getById(id: string) {
      await delay()
      return (await readDb()).entitySchemas.find((schema) => schema.id === id)
    },
    async getByCode(code: string) {
      await delay()
      return (await readDb()).entitySchemas.find((schema) => schema.code === code)
    },
    async create(input: CreateEntitySchemaInput) {
      const db = await readDb()
      const timestamp = nowIso()
      const schema: EntitySchema = {
        id: createId('ent'),
        code: uniqueSystemCode(input.name, db.entitySchemas.map((item) => item.code), 'entity'),
        name: input.name,
        description: input.description,
        geometryType: input.geometryType ?? 'none',
        mapSettings: defaultMapSettings(input.geometryType ?? 'none'),
        fields: input.includeAddress === false ? [] : [defaultAddressField()],
        status: 'draft',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      db.entitySchemas.push(schema)
      await writeDb(db)
      await delay()
      return schema
    },
    async save(schema: EntitySchema) {
      const db = await readDb()
      const existing = db.entitySchemas.find((item) => item.id === schema.id)
      const { schema: normalized, fieldCodeChanges } = normalizeEntitySchema(schema, existing, db)
      const updated: EntitySchema = { ...normalized, updatedAt: nowIso() }
      migrateEntityObjectFieldCodes(db, updated.id, fieldCodeChanges)
      db.entitySchemas = db.entitySchemas.map((item) => (item.id === schema.id ? updated : item))
      syncLayerWithMapSettings(db, updated)
      await writeDb(db)
      await delay()
      return updated
    },
    async publish(id: string) {
      const db = await readDb()
      const schema = db.entitySchemas.find((item) => item.id === id)
      if (!schema) throw new Error('Схема сущности не найдена')
      schema.status = 'active'
      schema.updatedAt = nowIso()
      grantDefaultPermissions(db, schema.id)
      ensureLayer(db, schema)
      ensureWorkflow(db, schema)
      await writeDb(db)
      await delay()
      return schema
    },
    async archive(id: string) {
      const db = await readDb()
      const schema = db.entitySchemas.find((item) => item.id === id)
      if (!schema) throw new Error('Схема сущности не найдена')
      schema.status = 'archived'
      schema.updatedAt = nowIso()
      await writeDb(db)
      await delay()
      return schema
    },
    async restore(id: string) {
      const db = await readDb()
      const schema = db.entitySchemas.find((item) => item.id === id)
      if (!schema) throw new Error('Схема сущности не найдена')
      schema.status = 'active'
      schema.updatedAt = nowIso()
      grantDefaultPermissions(db, schema.id)
      ensureLayer(db, schema)
      ensureWorkflow(db, schema)
      syncLayerWithMapSettings(db, schema)
      await writeDb(db)
      await delay()
      return schema
    },
    async duplicate(id: string) {
      const db = await readDb()
      const source = db.entitySchemas.find((item) => item.id === id)
      if (!source) throw new Error('Схема сущности не найдена')
      const timestamp = nowIso()
      const copy: EntitySchema = {
        ...source,
        id: createId('ent'),
        name: `${source.name} копия`,
        code: uniqueSystemCode(`${source.name} copy`, db.entitySchemas.map((schema) => schema.code), 'entity'),
        status: 'draft',
        fields: source.fields.map((field) => ({ ...field, id: createId('fld') })),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      copy.fields = normalizeFields(copy.fields)
      db.entitySchemas.push(copy)
      await writeDb(db)
      await delay()
      return copy
    },
    async delete(id: string) {
      const db = await readDb()
      const schema = db.entitySchemas.find((item) => item.id === id)
      if (!schema) throw new Error('Схема сущности не найдена')

      db.entitySchemas = db.entitySchemas.filter((item) => item.id !== id)
      db.entityObjects = db.entityObjects.filter((object) => object.entityId !== id)
      db.dictionaries = db.dictionaries.filter((dictionary) => dictionary.entityId !== id)
      db.workflows = db.workflows.filter((workflow) => workflow.entityId !== id)
      db.geoRules = db.geoRules.filter((rule) => rule.entityId !== id && rule.targetEntityId !== id)
      db.layers = db.layers.filter((layer) => layer.entityId !== id)
      db.tasks = db.tasks.filter((task) => task.entityId !== id)
      db.attachments = db.attachments.filter((attachment) => attachment.entityId !== id)
      db.auditEvents = db.auditEvents.filter((event) => event.entityId !== id)
      db.roles = db.roles.map((role) => ({
        ...role,
        permissions: role.permissions.filter((permission) => permission.entityId !== id),
      }))
      db.userSettings = db.userSettings.map((settings) => ({
        ...settings,
        home: {
          summaryBlocks: settings.home.summaryBlocks.filter((block) => block.entityId !== id),
        },
      }))

      await writeDb(db)
      await delay()
    },
  },

  entityObjects: {
    async listAll() {
      await delay()
      return (await readDb()).entityObjects
    },
    async listByEntity(entityId: string) {
      await delay()
      return (await readDb()).entityObjects.filter((object) => object.entityId === entityId)
    },
    async getById(id: string) {
      await delay()
      return (await readDb()).entityObjects.find((object) => object.id === id)
    },
    async create(input: CreateEntityObjectInput) {
      const db = await readDb()
      const timestamp = nowIso()
      const object: EntityObject = {
        id: createId('obj'),
        entityId: input.entityId,
        values: input.values,
        geometry: input.geometry,
        status: input.status ?? resolveObjectDataStatus(db, input.entityId, input.values, input.geometry),
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      }
      db.entityObjects.push(object)
      db.auditEvents.unshift({
        id: createId('aud'),
        entityId: object.entityId,
        objectId: object.id,
        at: timestamp,
        actorId: input.actorId,
        kind: 'change',
        title: 'Создан объект',
      })
      await writeDb(db)
      await delay()
      return object
    },
    async createMany(inputs: CreateEntityObjectInput[]) {
      const db = await readDb()
      const created: EntityObject[] = []
      inputs.forEach((input) => {
        const timestamp = nowIso()
        const object: EntityObject = {
          id: createId('obj'),
          entityId: input.entityId,
          values: input.values,
          geometry: input.geometry,
          status: input.status ?? resolveObjectDataStatus(db, input.entityId, input.values, input.geometry),
          createdAt: timestamp,
          updatedAt: timestamp,
          createdBy: input.actorId,
          updatedBy: input.actorId,
        }
        db.entityObjects.push(object)
        db.auditEvents.unshift({
          id: createId('aud'),
          entityId: object.entityId,
          objectId: object.id,
          at: timestamp,
          actorId: input.actorId,
          kind: 'change',
          title: 'Создан объект импортом',
        })
        created.push(object)
      })
      await writeDb(db)
      await delay()
      return created
    },
    async update(input: UpdateEntityObjectInput) {
      const db = await readDb()
      const object = db.entityObjects.find((item) => item.id === input.id)
      if (!object) throw new Error('Объект сущности не найден')
      object.values = input.values
      object.geometry = input.geometry
      object.status = resolveObjectDataStatus(db, object.entityId, input.values, input.geometry)
      object.updatedAt = nowIso()
      object.updatedBy = input.actorId
      db.auditEvents.unshift({
        id: createId('aud'),
        entityId: object.entityId,
        objectId: object.id,
        at: object.updatedAt,
        actorId: input.actorId,
        kind: 'change',
        title: 'Изменены атрибуты объекта',
      })
      await writeDb(db)
      await delay()
      return object
    },
    async delete(id: string) {
      const db = await readDb()
      const object = db.entityObjects.find((item) => item.id === id)
      if (!object) throw new Error('Объект сущности не найден')
      db.entityObjects = db.entityObjects.filter((item) => item.id !== id)
      db.tasks = db.tasks.filter((task) => task.objectId !== id)
      db.attachments = db.attachments.filter((attachment) => attachment.objectId !== id)
      db.auditEvents = db.auditEvents.filter((event) => event.objectId !== id)
      await writeDb(db)
      await delay()
    },
  },

  dictionaries: {
    async list() {
      await delay()
      return (await readDb()).dictionaries
    },
    async save(dictionary: Dictionary) {
      const db = await readDb()
      const existing = db.dictionaries.find((item) => item.id === dictionary.id)
      const { dictionary: normalized, itemCodeChanges } = normalizeDictionary(dictionary, existing, db)
      migrateEnumItemCodes(db, normalized, itemCodeChanges)
      const exists = db.dictionaries.some((item) => item.id === dictionary.id)
      db.dictionaries = exists
        ? db.dictionaries.map((item) => (item.id === dictionary.id ? normalized : item))
        : [...db.dictionaries, normalized]
      await writeDb(db)
      await delay()
      return normalized
    },
    async delete(id: string) {
      const db = await readDb()
      db.dictionaries = db.dictionaries.filter((dictionary) => dictionary.id !== id)
      db.entitySchemas = db.entitySchemas.map((schema) => ({
        ...schema,
        fields: schema.fields.map((field) => (field.enumId === id ? { ...field, enumId: undefined } : field)),
      }))
      await writeDb(db)
      await delay()
    },
    async addItem(dictionaryId: string, name: string) {
      const db = await readDb()
      const dictionary = db.dictionaries.find((item) => item.id === dictionaryId)
      if (!dictionary) throw new Error('Справочник не найден')
      const item: DictionaryItem = {
        id: createId('di'),
        code: uniqueSystemCode(name, dictionary.items.map((candidate) => candidate.code), 'value'),
        name,
        active: true,
      }
      dictionary.items.push(item)
      await writeDb(db)
      await delay()
      return item
    },
  },

  users: {
    async authenticate(login: string, password: string) {
      await delay()
      const db = await readDb()
      return db.users.find((user) => user.login === login && user.password === password && user.status === 'active')
    },
    async list() {
      await delay()
      return (await readDb()).users
    },
    async save(user: User) {
      const db = await readDb()
      db.users = db.users.some((item) => item.id === user.id)
        ? db.users.map((item) => (item.id === user.id ? user : item))
        : [...db.users, user]
      await writeDb(db)
      await delay()
      return user
    },
  },

  roles: {
    async list() {
      await delay()
      return (await readDb()).roles
    },
    async save(role: Role) {
      const db = await readDb()
      const normalized: Role = {
        ...role,
        code: uniqueSystemCode(role.name, db.roles.filter((item) => item.id !== role.id).map((item) => item.code), 'role'),
      }
      db.roles = db.roles.map((item) => (item.id === role.id ? normalized : item))
      await writeDb(db)
      await delay()
      return normalized
    },
  },

  organizations: {
    async list() {
      await delay()
      return (await readDb()).organizations
    },
    async save(organization: Organization) {
      const db = await readDb()
      db.organizations = db.organizations.some((item) => item.id === organization.id)
        ? db.organizations.map((item) => (item.id === organization.id ? organization : item))
        : [...db.organizations, organization]
      await writeDb(db)
      await delay()
      return organization
    },
  },

  workflows: {
    async list() {
      await delay()
      return (await readDb()).workflows
    },
    async getById(id: string) {
      await delay()
      return (await readDb()).workflows.find((workflow) => workflow.id === id)
    },
    async getByEntity(entityId: string) {
      await delay()
      return (await readDb()).workflows.find((workflow) => workflow.entityId === entityId && workflow.status === 'active')
    },
    async save(workflow: Workflow) {
      const db = await readDb()
      const existing = db.workflows.find((item) => item.id === workflow.id)
      const { workflow: normalized, stateCodeChanges } = normalizeWorkflow(workflow, existing)
      migrateWorkflowStateCodes(db, normalized.entityId, stateCodeChanges)
      db.workflows = db.workflows.some((item) => item.id === workflow.id)
        ? db.workflows.map((item) => (item.id === workflow.id ? normalized : item))
        : [...db.workflows, normalized]
      await writeDb(db)
      await delay()
      return normalized
    },
    async applyTransition(objectId: string, transitionId: string, actorId: string) {
      const db = await readDb()
      const object = db.entityObjects.find((item) => item.id === objectId)
      if (!object) throw new Error('Объект сущности не найден')
      const workflow = db.workflows.find((item) => item.entityId === object.entityId && item.status === 'active')
      const transition = workflow?.transitions.find((item) => item.id === transitionId)
      if (!workflow || !transition) throw new Error('Переход процесса не найден')
      const nextState = workflow.states.find((state) => state.id === transition.toStateId)
      const previous = object.status ?? 'draft'
      object.status = nextState?.code ?? previous
      object.updatedAt = nowIso()
      object.updatedBy = actorId
      db.auditEvents.unshift({
        id: createId('aud'),
        entityId: object.entityId,
        objectId: object.id,
        at: object.updatedAt,
        actorId,
        kind: 'workflow',
        title: `Статус: ${workflow.states.find((state) => state.code === previous)?.name ?? previous} → ${nextState?.name ?? object.status}`,
        details: transition.name,
      })
      if (object.status === 'review') {
        const manager = db.users.find((user) => user.roleIds.includes('role_manager'))
        if (manager) {
          db.tasks.unshift({
            id: createId('task'),
            title: `Проверить объект ${object.values.number ?? object.id}`,
            entityId: object.entityId,
            objectId: object.id,
            assigneeId: manager.id,
            dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString().slice(0, 10),
            status: 'new',
          })
        }
      }
      await writeDb(db)
      await delay()
      return object
    },
  },

  geoRules: {
    async list() {
      await delay()
      return (await readDb()).geoRules
    },
    async save(rule: GeoRule) {
      const db = await readDb()
      db.geoRules = db.geoRules.some((item) => item.id === rule.id)
        ? db.geoRules.map((item) => (item.id === rule.id ? rule : item))
        : [...db.geoRules, rule]
      await writeDb(db)
      await delay()
      return rule
    },
    async validate(object: EntityObject): Promise<GeoValidationResult> {
      const db = await readDb()
      const rules = db.geoRules.filter((rule) => rule.entityId === object.entityId && rule.status === 'active')
      const conflicts = rules.flatMap((rule) => {
        const targetSchema = db.entitySchemas.find((schema) => schema.id === rule.targetEntityId)
        if (!targetSchema) return []
        return db.entityObjects
          .filter((targetObject) => targetObject.entityId === rule.targetEntityId)
          .filter((targetObject) => matchesRule(rule, object, targetObject))
          .map((targetObject) => ({ rule, targetObject, targetSchema }))
      })
      await delay()
      return { ok: conflicts.length === 0, conflicts }
    },
  },

  layers: {
    async list() {
      await delay()
      return (await readDb()).layers
    },
    async save(layer: Layer) {
      const db = await readDb()
      db.layers = db.layers.some((item) => item.id === layer.id)
        ? db.layers.map((item) => (item.id === layer.id ? layer : item))
        : [...db.layers, layer]
      await writeDb(db)
      await delay()
      return layer
    },
  },

  tasks: {
    async list() {
      await delay()
      return (await readDb()).tasks
    },
    async listByAssignee(userId: string) {
      await delay()
      return (await readDb()).tasks.filter((task) => task.assigneeId === userId)
    },
    async complete(taskId: string) {
      const db = await readDb()
      const task = db.tasks.find((item) => item.id === taskId)
      if (task) task.status = 'done'
      await writeDb(db)
      await delay()
      return task
    },
  },

  attachments: {
    async listByObject(entityId: string, objectId: string) {
      await delay()
      return (await readDb()).attachments.filter((item) => item.entityId === entityId && item.objectId === objectId)
    },
    async add(
      entityId: string,
      objectId: string,
      actorId: string,
      attachmentInput: {
        name: string
        type?: string
        mimeType?: string
        size?: string
        sizeBytes?: number
        dataUrl?: string
      },
    ) {
      const db = await readDb()
      const attachment: Attachment = {
        id: createId('att'),
        entityId,
        objectId,
        name: attachmentInput.name,
        type: attachmentInput.type ?? attachmentInput.name.split('.').pop()?.toUpperCase() ?? 'Файл',
        mimeType: attachmentInput.mimeType,
        date: nowIso(),
        authorId: actorId,
        size: attachmentInput.size ?? formatFileSize(attachmentInput.sizeBytes),
        sizeBytes: attachmentInput.sizeBytes,
        dataUrl: attachmentInput.dataUrl,
      }
      db.attachments.unshift(attachment)
      db.auditEvents.unshift({
        id: createId('aud'),
        entityId,
        objectId,
        at: attachment.date,
        actorId,
        kind: 'document',
        title: `Добавлен документ: ${attachment.name}`,
      })
      await writeDb(db)
      await delay()
      return attachment
    },
    async delete(id: string) {
      const db = await readDb()
      db.attachments = db.attachments.filter((item) => item.id !== id)
      await writeDb(db)
      await delay()
    },
  },

  auditEvents: {
    async listByObject(entityId: string, objectId: string) {
      await delay()
      return (await readDb()).auditEvents.filter((item) => item.entityId === entityId && item.objectId === objectId)
    },
    async add(event: AuditEvent) {
      const db = await readDb()
      db.auditEvents.unshift(event)
      await writeDb(db)
      await delay()
      return event
    },
  },

  settings: {
    async get() {
      await delay()
      return (await readDb()).settings
    },
    async save(settings: PlatformSettings) {
      const db = await readDb()
      db.settings = settings
      await writeDb(db)
      await delay()
      return settings
    },
  },

  userSettings: {
    async getByUser(userId: string) {
      const db = await readDb()
      const settings = ensureUserSettings(db, userId)
      await writeDb(db)
      await delay()
      return settings
    },
    async save(settings: UserSettings) {
      const db = await readDb()
      const normalized = normalizeUserSettings(settings, db)
      db.userSettings = db.userSettings.some((item) => item.userId === settings.userId)
        ? db.userSettings.map((item) => (item.userId === settings.userId ? normalized : item))
        : [...db.userSettings, normalized]
      await writeDb(db)
      await delay()
      return normalized
    },
  },
}

let dbCache: AppDatabase | null = null
let dbLoadPromise: Promise<AppDatabase> | null = null

async function readDb(): Promise<AppDatabase> {
  if (dbCache) return dbCache
  if (dbLoadPromise) return dbLoadPromise

  dbLoadPromise = loadDb()
  try {
    dbCache = await dbLoadPromise
    return dbCache
  } finally {
    dbLoadPromise = null
  }
}

async function writeDb(db: AppDatabase): Promise<void> {
  dbCache = db
  if (STATIC_STORAGE_ENABLED) {
    writeLegacyDb(db)
    markLegacyStorageMigrated()
    return
  }

  try {
    await writeRuntimeDb(db)
    markLegacyStorageMigrated()
  } catch {
    writeLegacyDb(db)
  }
}

async function loadDb(): Promise<AppDatabase> {
  const legacyDb = readLegacyDb()

  if (STATIC_STORAGE_ENABLED) {
    const staticDb = migrateDb(legacyDb ?? createSeedDatabase())
    writeLegacyDb(staticDb)
    markLegacyStorageMigrated()
    return staticDb
  }

  try {
    const runtimeDb = migrateDb(await readRuntimeDb())
    const migratedLegacyDb = legacyDb ? migrateDb(legacyDb) : null
    const shouldImportLegacy = Boolean(
      migratedLegacyDb
        && !isLegacyStorageMigrated()
        && shouldPreferLegacyDb(migratedLegacyDb, runtimeDb),
    )

    if (shouldImportLegacy && migratedLegacyDb) {
      await writeRuntimeDb(migratedLegacyDb)
      markLegacyStorageMigrated()
      return migratedLegacyDb
    }

    if (!isLegacyStorageMigrated()) markLegacyStorageMigrated()
    return runtimeDb
  } catch {
    const fallback = migrateDb(legacyDb ?? createSeedDatabase())
    writeLegacyDb(fallback)
    return fallback
  }
}

async function readRuntimeDb(): Promise<AppDatabase> {
  if (typeof fetch === 'undefined') throw new Error('Runtime API недоступен')
  const response = await fetch(SQLITE_DATABASE_ENDPOINT, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error('SQLite runtime не вернул данные')
  const snapshot = await response.json()
  if (!isAppDatabase(snapshot)) throw new Error('SQLite runtime вернул некорректные данные')
  return snapshot
}

async function writeRuntimeDb(db: AppDatabase): Promise<void> {
  if (typeof fetch === 'undefined') throw new Error('Runtime API недоступен')
  const response = await fetch(SQLITE_DATABASE_ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(db),
  })
  if (!response.ok) throw new Error('SQLite runtime не сохранил данные')
}

function readLegacyDb(): AppDatabase | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as AppDatabase : null
  } catch {
    return null
  }
}

function writeLegacyDb(db: AppDatabase): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

function isLegacyStorageMigrated(): boolean {
  return localStorage.getItem(SQLITE_MIGRATION_KEY) === 'true'
}

function markLegacyStorageMigrated(): void {
  localStorage.setItem(SQLITE_MIGRATION_KEY, 'true')
}

function shouldPreferLegacyDb(legacyDb: AppDatabase, runtimeDb: AppDatabase): boolean {
  const seed = migrateDb(createSeedDatabase())
  const legacyScore = databaseContentScore(legacyDb)
  const runtimeScore = databaseContentScore(runtimeDb)
  if (legacyScore > runtimeScore) return true
  return runtimeScore === 0
    && stableDatabaseJson(legacyDb) !== stableDatabaseJson(seed)
    && stableDatabaseJson(runtimeDb) === stableDatabaseJson(seed)
}

function databaseContentScore(db: AppDatabase): number {
  const homeBlocks = db.userSettings.reduce((sum, settings) => sum + settings.home.summaryBlocks.length, 0)
  const extraUsers = db.users.filter((user) => user.id !== 'usr_admin').length
  const extraRoles = db.roles.filter((role) => role.id !== 'role_admin').length
  const extraOrganizations = db.organizations.filter((organization) => organization.id !== 'org_system').length
  return db.entitySchemas.length * 100
    + db.entityObjects.length * 20
    + db.dictionaries.length * 15
    + db.workflows.length * 12
    + db.geoRules.length * 10
    + db.layers.length * 8
    + db.tasks.length * 6
    + db.attachments.length * 4
    + db.auditEvents.length
    + homeBlocks * 5
    + extraUsers * 5
    + extraRoles * 5
    + extraOrganizations * 3
}

function stableDatabaseJson(db: AppDatabase): string {
  return JSON.stringify(db)
}

function isAppDatabase(value: unknown): value is AppDatabase {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Record<keyof AppDatabase, unknown>>
  return Array.isArray(candidate.entitySchemas)
    && Array.isArray(candidate.entityObjects)
    && Array.isArray(candidate.dictionaries)
    && Array.isArray(candidate.users)
    && Array.isArray(candidate.roles)
    && Array.isArray(candidate.organizations)
    && Array.isArray(candidate.workflows)
    && Array.isArray(candidate.tasks)
    && Array.isArray(candidate.geoRules)
    && Array.isArray(candidate.layers)
    && Array.isArray(candidate.attachments)
    && Array.isArray(candidate.auditEvents)
    && typeof candidate.settings === 'object'
    && Array.isArray(candidate.userSettings)
}

function migrateDb(db: AppDatabase): AppDatabase {
  const seed = createSeedDatabase()
  const dictionaryEntityByCode: Record<string, string> = {
    work_types: 'ent_orders',
    playground_condition: 'ent_playgrounds',
    parking_type: 'ent_orders',
  }
  const roleNamesByCode: Record<string, string> = {
    admin: 'Администратор',
    operator: 'Оператор',
    manager: 'Руководитель',
    viewer: 'Наблюдатель',
  }
  const settings = db.settings ?? seed.settings
  const fallbackEntityId = db.entitySchemas[0]?.id ?? ''
  const migrated = removeDefaultDemoData({
    ...db,
    entitySchemas: (db.entitySchemas ?? []).map((schema) => normalizeEntityMapSettings(schema)),
    entityObjects: db.entityObjects ?? [],
    dictionaries: (db.dictionaries ?? []).map((dictionary) => ({
      ...dictionary,
      entityId: dictionary.entityId ?? dictionaryEntityByCode[dictionary.code] ?? fallbackEntityId,
    })),
    users: db.users ?? [],
    roles: (db.roles ?? []).map((role) => ({ ...role, name: roleNamesByCode[role.code] ?? role.name })),
    organizations: db.organizations ?? [],
    workflows: db.workflows ?? [],
    tasks: db.tasks ?? [],
    geoRules: db.geoRules ?? [],
    layers: db.layers ?? [],
    attachments: db.attachments ?? [],
    auditEvents: db.auditEvents ?? [],
    settings: {
      ...settings,
      platformName: settings.platformName === 'Low-code GIS Platform' ? 'Муниципальная платформа' : settings.platformName,
    },
    userSettings: db.userSettings ?? [],
  })
  ensureSystemBootstrap(migrated)
  migrated.users.forEach((user) => ensureUserSettings(migrated, user.id))
  migrated.userSettings = migrated.userSettings.map((settings) => normalizeUserSettings(settings, migrated))
  migrated.entityObjects = migrated.entityObjects.map((object) => ({
    ...object,
    status: resolveObjectDataStatus(migrated, object.entityId, object.values, object.geometry),
  }))
  return migrated
}

function removeDefaultDemoData(db: AppDatabase): AppDatabase {
  const removedEntityIds = new Set(
    db.entitySchemas
      .filter((schema) => DEMO_ENTITY_IDS.has(schema.id) || DEMO_ENTITY_CODES.has(schema.code))
      .map((schema) => schema.id),
  )

  const entitySchemas = db.entitySchemas.filter((schema) => !removedEntityIds.has(schema.id))
  const remainingEntityIds = new Set(entitySchemas.map((schema) => schema.id))
  const users = db.users.filter((user) => !DEMO_USER_IDS.has(user.id))

  return {
    ...db,
    entitySchemas,
    entityObjects: db.entityObjects.filter((object) => !removedEntityIds.has(object.entityId)),
    dictionaries: db.dictionaries.filter((dictionary) =>
      !removedEntityIds.has(dictionary.entityId)
      && !DEMO_DICTIONARY_IDS.has(dictionary.id)
      && !DEMO_DICTIONARY_CODES.has(dictionary.code),
    ),
    users,
    roles: db.roles
      .filter((role) => !DEMO_ROLE_IDS.has(role.id))
      .map((role) => ({
        ...role,
        permissions: role.permissions.filter((permission) => !permission.entityId || remainingEntityIds.has(permission.entityId)),
      })),
    organizations: db.organizations.filter((organization) => !DEMO_ORGANIZATION_IDS.has(organization.id)),
    workflows: db.workflows.filter((workflow) => !removedEntityIds.has(workflow.entityId) && !DEMO_WORKFLOW_IDS.has(workflow.id)),
    tasks: db.tasks.filter((task) => !removedEntityIds.has(task.entityId) && !DEMO_TASK_IDS.has(task.id)),
    geoRules: db.geoRules.filter((rule) =>
      !removedEntityIds.has(rule.entityId)
      && !removedEntityIds.has(rule.targetEntityId)
      && !DEMO_GEO_RULE_IDS.has(rule.id),
    ),
    layers: db.layers.filter((layer) => !removedEntityIds.has(layer.entityId) && !DEMO_LAYER_IDS.has(layer.id)),
    attachments: db.attachments.filter((attachment) => !removedEntityIds.has(attachment.entityId) && !DEMO_ATTACHMENT_IDS.has(attachment.id)),
    auditEvents: db.auditEvents.filter((event) => !removedEntityIds.has(event.entityId) && !DEMO_AUDIT_IDS.has(event.id)),
    userSettings: db.userSettings.filter((settings) => users.some((user) => user.id === settings.userId)),
  }
}

function ensureSystemBootstrap(db: AppDatabase): void {
  if (!db.organizations.some((organization) => organization.id === 'org_system')) {
    db.organizations.unshift({ id: 'org_system', name: 'Система' })
  }

  let adminRole = db.roles.find((role) => role.id === 'role_admin' || role.code === 'admin')
  if (!adminRole) {
    adminRole = {
      id: 'role_admin',
      code: 'admin',
      name: 'Администратор',
      permissions: [],
    }
    db.roles.unshift(adminRole)
  }
  adminRole.id = 'role_admin'
  adminRole.code = 'admin'
  adminRole.name = adminRole.name || 'Администратор'
  adminRole.permissions = [{ system: '*', view: true, create: true, edit: true, delete: true, transition: true }]

  let adminUser = db.users.find((user) => user.id === 'usr_admin' || user.login === 'admin')
  if (!adminUser) {
    adminUser = {
      id: 'usr_admin',
      login: 'admin',
      password: 'admin',
      lastName: 'Администратор',
      firstName: 'Системы',
      organizationId: 'org_system',
      roleIds: ['role_admin'],
      status: 'active',
    }
    db.users.unshift(adminUser)
  }
  adminUser.id = 'usr_admin'
  adminUser.login = adminUser.login || 'admin'
  adminUser.password = adminUser.password || 'admin'
  adminUser.organizationId = db.organizations.some((organization) => organization.id === adminUser.organizationId)
    ? adminUser.organizationId
    : 'org_system'
  adminUser.roleIds = Array.from(new Set([...adminUser.roleIds, 'role_admin']))
  adminUser.status = 'active'
}

function delay(): Promise<void> {
  const [min, max] = latencyRange
  return new Promise((resolve) => window.setTimeout(resolve, min + Math.random() * (max - min)))
}

function matchesRule(rule: GeoRule, object: EntityObject, targetObject: EntityObject): boolean {
  if (!object.geometry || !targetObject.geometry) return false
  if (rule.operator === 'INTERSECTS') return geometriesIntersect(object.geometry, targetObject.geometry)
  if (rule.operator === 'WITHIN') return geometriesIntersect(object.geometry, targetObject.geometry)
  return distanceBetweenGeometriesMeters(object.geometry, targetObject.geometry) <= (rule.distanceMeters ?? 0)
}

function normalizeEntitySchema(
  schema: EntitySchema,
  existing: EntitySchema | undefined,
  db: AppDatabase,
): { schema: EntitySchema; fieldCodeChanges: Array<{ oldCode: string; newCode: string }> } {
  const fieldCodeChanges: Array<{ oldCode: string; newCode: string }> = []
  const usedFieldCodes = new Set<string>()
  const normalizedFields = schema.fields.map((field, index) => {
    const oldCode = existing?.fields.find((candidate) => candidate.id === field.id)?.code ?? field.code
    const newCode = uniqueSystemCode(field.name, usedFieldCodes, 'field')
    usedFieldCodes.add(newCode)
    if (oldCode && oldCode !== newCode) fieldCodeChanges.push({ oldCode, newCode })
    return { ...field, code: newCode, searchable: true, filterable: true, order: index + 1 }
  })
  const mapSettings = normalizeMapSettings(
    (schema as EntitySchema & { mapSettings?: EntityMapSettings }).mapSettings,
    schema.geometryType,
  )
  const geometryType = primaryGeometryType(mapSettings, schema.geometryType)

  return {
    schema: {
      ...schema,
      geometryType,
      mapSettings,
      code: uniqueSystemCode(
        schema.name,
        db.entitySchemas.filter((candidate) => candidate.id !== schema.id).map((candidate) => candidate.code),
        'entity',
      ),
      fields: normalizedFields,
    },
    fieldCodeChanges,
  }
}

function normalizeFields(fields: EntitySchema['fields']): EntitySchema['fields'] {
  const usedCodes = new Set<string>()
  return fields.map((field, index) => {
    const code = uniqueSystemCode(field.name, usedCodes, 'field')
    usedCodes.add(code)
    return { ...field, code, searchable: true, filterable: true, order: index + 1 }
  })
}

function normalizeEntityMapSettings(schema: EntitySchema): EntitySchema {
  const mapSettings = normalizeMapSettings(
    (schema as EntitySchema & { mapSettings?: EntityMapSettings }).mapSettings,
    schema.geometryType,
  )
  return {
    ...schema,
    geometryType: primaryGeometryType(mapSettings, schema.geometryType),
    mapSettings,
    fields: normalizeFields(schema.fields),
  }
}

function defaultAddressField(): EntitySchema['fields'][number] {
  return {
    id: createId('fld'),
    code: 'address',
    name: 'Адрес',
    type: 'address',
    required: false,
    listVisible: true,
    cardVisible: true,
    searchable: true,
    filterable: true,
    order: 1,
  }
}

function defaultMapSettings(geometryType: GeometryType = 'none'): EntityMapSettings {
  return {
    enabledGeometryTypes: geometryTypeToEnabledList(geometryType),
    clusteringEnabled: false,
    styles: defaultGeometryStyles(),
    colorRules: [],
  }
}

function normalizeMapSettings(settings: EntityMapSettings | undefined, geometryType: GeometryType): EntityMapSettings {
  const stored = settings as StoredMapSettings | undefined
  const fallback = defaultMapSettings(geometryType)
  const enabledGeometryTypes = (stored?.enabledGeometryTypes ?? geometryTypeToEnabledList(geometryType))
    .filter((type): type is EntityMapSettings['enabledGeometryTypes'][number] =>
      type === 'point' || type === 'lineString' || type === 'polygon',
    )

  return {
    enabledGeometryTypes: enabledGeometryTypes.length > 0 ? enabledGeometryTypes : fallback.enabledGeometryTypes,
    clusteringEnabled: Boolean(stored?.clusteringEnabled),
    styles: {
      point: normalizeMapStyle(stored?.styles?.point ?? stored?.style, fallback.styles.point),
      lineString: normalizeMapStyle(stored?.styles?.lineString ?? stored?.style, fallback.styles.lineString),
      polygon: normalizeMapStyle(stored?.styles?.polygon ?? stored?.style, fallback.styles.polygon),
    },
    colorRules: (stored?.colorRules ?? []).map((rule) => ({
      id: rule.id || createId('maprule'),
      name: rule.name || 'Условие цвета',
      fieldCode: rule.fieldCode || '__status',
      operator: rule.operator || 'equals',
      value: String(rule.value ?? ''),
      color: rule.color || '#ef4444',
    })),
  }
}

function defaultGeometryStyles(): Record<EntityMapSettings['enabledGeometryTypes'][number], EntityMapStyle> {
  return {
    point: {
      fill: '#f97316',
      stroke: '#c2410c',
      strokeWidth: 2,
      pointSize: 8,
      opacity: 0.82,
    },
    lineString: {
      fill: '#38bdf8',
      stroke: '#0284c7',
      strokeWidth: 3,
      pointSize: 8,
      opacity: 0.9,
    },
    polygon: {
      fill: '#2563eb',
      stroke: '#1d4ed8',
      strokeWidth: 2,
      pointSize: 8,
      opacity: 0.74,
    },
  }
}

function normalizeMapStyle(style: Partial<EntityMapStyle> | undefined, fallback: EntityMapStyle): EntityMapStyle {
  return {
    fill: style?.fill || fallback.fill,
    stroke: style?.stroke || fallback.stroke,
    strokeWidth: Math.max(1, Number(style?.strokeWidth ?? fallback.strokeWidth)),
    pointSize: Math.max(4, Number(style?.pointSize ?? fallback.pointSize)),
    opacity: Math.min(1, Math.max(0.1, Number(style?.opacity ?? fallback.opacity))),
  }
}

function primaryMapStyle(schema: EntitySchema): EntityMapStyle {
  const geometryType = schema.geometryType === 'none' ? schema.mapSettings.enabledGeometryTypes[0] : schema.geometryType
  return schema.mapSettings.styles[geometryType] ?? schema.mapSettings.styles.point
}

function geometryTypeToEnabledList(geometryType: GeometryType): EntityMapSettings['enabledGeometryTypes'] {
  return geometryType === 'none' ? [] : [geometryType]
}

function primaryGeometryType(settings: EntityMapSettings, current: GeometryType): GeometryType {
  if (current !== 'none' && settings.enabledGeometryTypes.includes(current)) return current
  return settings.enabledGeometryTypes[0] ?? 'none'
}

function migrateEntityObjectFieldCodes(
  db: AppDatabase,
  entityId: string,
  changes: Array<{ oldCode: string; newCode: string }>,
): void {
  if (changes.length === 0) return
  db.entityObjects = db.entityObjects.map((object) => {
    if (object.entityId !== entityId) return object
    const values = { ...object.values }
    changes.forEach(({ oldCode, newCode }) => {
      if (oldCode in values && !(newCode in values)) values[newCode] = values[oldCode]
      if (oldCode !== newCode) delete values[oldCode]
    })
    return { ...object, values }
  })
}

function normalizeDictionary(
  dictionary: Dictionary,
  existing: Dictionary | undefined,
  db: AppDatabase,
): { dictionary: Dictionary; itemCodeChanges: Array<{ oldCode: string; newCode: string }> } {
  const itemCodeChanges: Array<{ oldCode: string; newCode: string }> = []
  const usedItemCodes = new Set<string>()
  const items = dictionary.items.map((item) => {
    const oldCode = existing?.items.find((candidate) => candidate.id === item.id)?.code ?? item.code
    const newCode = uniqueSystemCode(item.name, usedItemCodes, 'value')
    usedItemCodes.add(newCode)
    if (oldCode && oldCode !== newCode) itemCodeChanges.push({ oldCode, newCode })
    return { ...item, code: newCode }
  })

  return {
    dictionary: {
      ...dictionary,
      code: uniqueSystemCode(
        dictionary.name,
        db.dictionaries
          .filter((candidate) => candidate.id !== dictionary.id && candidate.entityId === dictionary.entityId)
          .map((candidate) => candidate.code),
        'dictionary',
      ),
      items,
    },
    itemCodeChanges,
  }
}

function migrateEnumItemCodes(
  db: AppDatabase,
  dictionary: Dictionary,
  changes: Array<{ oldCode: string; newCode: string }>,
): void {
  if (changes.length === 0) return
  const enumFieldCodes = db.entitySchemas
    .find((schema) => schema.id === dictionary.entityId)
    ?.fields.filter((field) => field.enumId === dictionary.id)
    .map((field) => field.code) ?? []

  db.entityObjects = db.entityObjects.map((object) => {
    if (object.entityId !== dictionary.entityId) return object
    const values = { ...object.values }
    enumFieldCodes.forEach((fieldCode) => {
      const change = changes.find((item) => item.oldCode === values[fieldCode])
      if (change) values[fieldCode] = change.newCode
    })
    return { ...object, values }
  })
}

function normalizeWorkflow(
  workflow: Workflow,
  existing: Workflow | undefined,
): { workflow: Workflow; stateCodeChanges: Array<{ oldCode: string; newCode: string }> } {
  const stateCodeChanges: Array<{ oldCode: string; newCode: string }> = []
  const usedStateCodes = new Set<string>()
  const states = workflow.states.map((state) => {
    const oldCode = existing?.states.find((candidate) => candidate.id === state.id)?.code ?? state.code
    const newCode = uniqueSystemCode(state.name, usedStateCodes, 'state')
    usedStateCodes.add(newCode)
    if (oldCode && oldCode !== newCode) stateCodeChanges.push({ oldCode, newCode })
    return { ...state, code: newCode }
  })

  return { workflow: { ...workflow, states }, stateCodeChanges }
}

function migrateWorkflowStateCodes(
  db: AppDatabase,
  entityId: string,
  changes: Array<{ oldCode: string; newCode: string }>,
): void {
  if (changes.length === 0) return
  db.entityObjects = db.entityObjects.map((object) => {
    if (object.entityId !== entityId) return object
    const change = changes.find((item) => item.oldCode === object.status)
    return change ? { ...object, status: change.newCode } : object
  })
}

function resolveObjectDataStatus(
  db: AppDatabase,
  entityId: string,
  values: EntityObjectValues,
  geometry?: EntityObject['geometry'],
): string {
  const schema = db.entitySchemas.find((item) => item.id === entityId)
  const issues = validateEntityObjectData({
    schema,
    dictionaries: db.dictionaries.filter((dictionary) => dictionary.entityId === entityId),
    values,
    geometry,
  })
  return objectDataStatusFromIssues(issues)
}

function ensureUserSettings(db: AppDatabase, userId: string): UserSettings {
  let settings = db.userSettings.find((item) => item.userId === userId)
  if (!settings) {
    settings = defaultUserSettings(userId)
    db.userSettings.push(settings)
  }
  return settings
}

function defaultUserSettings(userId: string): UserSettings {
  return {
    userId,
    home: {
      summaryBlocks: [],
    },
  }
}

function normalizeUserSettings(settings: UserSettings, db: AppDatabase): UserSettings {
  const entityIds = new Set(db.entitySchemas.map((schema) => schema.id))
  const blocks = (settings.home?.summaryBlocks ?? [])
    .filter((block) => entityIds.has(block.entityId))
    .map((sourceBlock, index) => {
      const block = sourceBlock as StoredSummaryBlock
      const schema = db.entitySchemas.find((candidate) => candidate.id === block.entityId)
      const fieldExists = Boolean(block.fieldCode && schema?.fields.some((field) => field.code === block.fieldCode))
      const fieldCode = block.metric === 'count' ? '' : fieldExists ? block.fieldCode : schema?.fields[0]?.code ?? ''
      const normalizedFilters = normalizeDashboardFilters(block.filters ?? [], schema).slice(0, 1)
      const normalizedFilterGroups = normalizeDashboardFilterGroups(block.filterGroups ?? [], schema).slice(0, 1)
      const filters = normalizedFilters
      const filterGroups = filters.length > 0 ? [] : normalizedFilterGroups
      return {
        id: block.id || createId('sum'),
        entityId: block.entityId,
        fieldCode,
        metric: block.metric,
        title: String(block.title ?? '').trim() || defaultSummaryTitle(block, db),
        showInfo: Boolean(String(block.description ?? '').trim() || filters.length || filterGroups.length),
        description: String(block.description ?? '').trim(),
        widthPx: normalizeSummaryWidth(block),
        order: index + 1,
        filters,
        filterGroups,
      }
    })

  return {
    userId: settings.userId,
    home: { summaryBlocks: blocks },
  }
}

function normalizeDashboardThenAction(value: unknown): DashboardThenAction {
  return value === 'green' || value === 'yellow' || value === 'red' ? value : 'none'
}

function normalizeSummaryWidth(block: StoredSummaryBlock): number {
  const rawWidth = Number.isFinite(block.widthPx)
    ? Number(block.widthPx)
    : LEGACY_SUMMARY_WIDTHS[String(block.width ?? '')] ?? SUMMARY_DEFAULT_WIDTH_PX

  return Math.max(SUMMARY_DEFAULT_WIDTH_PX, Math.round(rawWidth / SUMMARY_WIDTH_STEP_PX) * SUMMARY_WIDTH_STEP_PX)
}

function normalizeDashboardFilters(filters: DashboardFilter[], schema: EntitySchema | undefined): DashboardFilter[] {
  return filters
    .filter((filterItem) => isValidDashboardFilterField(filterItem.fieldCode, schema))
    .map((filterItem) => ({
      id: filterItem.id || createId('flt'),
      fieldCode: filterItem.fieldCode,
      operator: filterItem.operator,
      value: String(filterItem.value ?? ''),
      thenAction: normalizeDashboardThenAction(filterItem.thenAction),
    }))
}

function normalizeDashboardFilterGroups(groups: DashboardFilterGroup[], schema: EntitySchema | undefined): DashboardFilterGroup[] {
  return groups
    .map((group) => ({
      id: group.id || createId('fg'),
      thenAction: normalizeDashboardThenAction(group.thenAction),
      filters: normalizeDashboardFilters(group.filters ?? [], schema).map((filter) => ({
        ...filter,
        thenAction: 'none' as const,
      })),
    }))
    .filter((group) => group.filters.length > 0)
}

function isValidDashboardFilterField(fieldCode: string, schema: EntitySchema | undefined): boolean {
  if (fieldCode === '__status' || fieldCode === '__createdAt' || fieldCode === '__updatedAt' || fieldCode === '__summaryValue') return true
  return Boolean(schema?.fields.some((field) => field.code === fieldCode))
}

function defaultSummaryTitle(
  block: Pick<DashboardSummaryBlock, 'entityId' | 'fieldCode' | 'metric'>,
  db: AppDatabase,
): string {
  const schema = db.entitySchemas.find((candidate) => candidate.id === block.entityId)
  const field = schema?.fields.find((candidate) => candidate.code === block.fieldCode)
  if (block.metric === 'count') return schema?.name ?? 'Саммари'
  return field ? `${schema?.name ?? 'Сущность'} · ${field.name}` : schema?.name ?? 'Саммари'
}

function grantDefaultPermissions(db: AppDatabase, entityId: string): void {
  db.roles = db.roles.map((role) => {
    if (role.permissions.some((permission) => permission.system === '*')) return role
    if (role.permissions.some((permission) => permission.entityId === entityId)) return role

    const base = {
      entityId,
      view: true,
      create: false,
      edit: false,
      delete: false,
      transition: false,
    }

    if (role.code === 'operator') return { ...role, permissions: [...role.permissions, { ...base, create: true, edit: true }] }
    if (role.code === 'manager') return { ...role, permissions: [...role.permissions, { ...base, transition: true }] }
    return { ...role, permissions: [...role.permissions, base] }
  })
}

function ensureLayer(db: AppDatabase, schema: EntitySchema): void {
  if (schema.geometryType === 'none' || db.layers.some((layer) => layer.entityId === schema.id)) return
  const style = primaryMapStyle(schema)
  db.layers.push({
    id: createId('layer'),
    name: schema.name,
    entityId: schema.id,
    source: 'entity',
    geometryType: schema.geometryType,
    visibleByDefault: true,
    selectable: true,
    opacity: style.opacity,
    style: {
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      pointSize: style.pointSize,
    },
  })
}

function syncLayerWithMapSettings(db: AppDatabase, schema: EntitySchema): void {
  const style = primaryMapStyle(schema)
  db.layers = db.layers.map((layer) => {
    if (layer.entityId !== schema.id) return layer
    return {
      ...layer,
      name: schema.name,
      geometryType: schema.geometryType,
      opacity: style.opacity,
      style: {
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        pointSize: style.pointSize,
      },
    }
  })
}

function ensureWorkflow(db: AppDatabase, schema: EntitySchema): void {
  if (db.workflows.some((workflow) => workflow.entityId === schema.id)) return
  db.workflows.push({
    id: createId('wf'),
    entityId: schema.id,
    name: `Жизненный цикл: ${schema.name}`,
    status: 'active',
    states: [
      { id: createId('st'), code: 'draft', name: 'Черновик', initial: true, final: false, x: 80, y: 80 },
      { id: createId('st'), code: 'active', name: 'Активен', initial: false, final: false, x: 320, y: 80 },
      { id: createId('st'), code: 'closed', name: 'Закрыт', initial: false, final: true, x: 560, y: 80 },
    ],
    transitions: [],
  })
  const workflow = db.workflows[db.workflows.length - 1]
  const [draft, active, closed] = workflow.states
  workflow.transitions = [
    {
      id: createId('tr'),
      name: 'Активировать',
      fromStateId: draft.id,
      toStateId: active.id,
      allowedRoleIds: ['role_operator', 'role_manager', 'role_admin'],
      validateRequiredFields: true,
      validateGeoRules: true,
    },
    {
      id: createId('tr'),
      name: 'Закрыть',
      fromStateId: active.id,
      toStateId: closed.id,
      allowedRoleIds: ['role_manager', 'role_admin'],
      validateRequiredFields: false,
      validateGeoRules: false,
    },
  ]
}

function formatFileSize(sizeBytes: number | undefined): string {
  if (!Number.isFinite(sizeBytes) || !sizeBytes) return '—'
  if (sizeBytes < 1024) return `${sizeBytes} Б`
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} КБ`
  return `${(sizeBytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`
}
