import { createId, nowIso } from '../lib/id'
import { uniqueSystemCode } from '../lib/codegen'
import {
  distanceBetweenGeometriesMeters,
  geometriesIntersect,
} from '../lib/geometry'
import type {
  AppDatabase,
  Attachment,
  AuditEvent,
  Dictionary,
  DictionaryItem,
  EntityObject,
  EntityObjectValues,
  EntitySchema,
  GeoRule,
  GeoValidationResult,
  GeometryType,
  Layer,
  Organization,
  PlatformSettings,
  Role,
  User,
  Workflow,
} from '../types/domain'
import { createSeedDatabase } from './seed'

const STORAGE_KEY = 'low-code-gis-platform-db-v1'
const latencyRange = [220, 480] as const

export interface CreateEntitySchemaInput {
  name: string
  code?: string
  description?: string
  geometryType: GeometryType
}

export interface CreateEntityObjectInput {
  entityId: string
  values: EntityObjectValues
  geometry?: EntityObject['geometry']
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
      writeDb(createSeedDatabase())
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
      return readDb().entitySchemas
    },
    async listActive() {
      await delay()
      return readDb().entitySchemas.filter((schema) => schema.status === 'active')
    },
    async getById(id: string) {
      await delay()
      return readDb().entitySchemas.find((schema) => schema.id === id)
    },
    async getByCode(code: string) {
      await delay()
      return readDb().entitySchemas.find((schema) => schema.code === code)
    },
    async create(input: CreateEntitySchemaInput) {
      const db = readDb()
      const timestamp = nowIso()
      const schema: EntitySchema = {
        id: createId('ent'),
        code: uniqueSystemCode(input.name, db.entitySchemas.map((item) => item.code), 'entity'),
        name: input.name,
        description: input.description,
        geometryType: input.geometryType,
        fields: [],
        status: 'draft',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      db.entitySchemas.push(schema)
      writeDb(db)
      await delay()
      return schema
    },
    async save(schema: EntitySchema) {
      const db = readDb()
      const existing = db.entitySchemas.find((item) => item.id === schema.id)
      const { schema: normalized, fieldCodeChanges } = normalizeEntitySchema(schema, existing, db)
      const updated: EntitySchema = { ...normalized, updatedAt: nowIso() }
      migrateEntityObjectFieldCodes(db, updated.id, fieldCodeChanges)
      db.entitySchemas = db.entitySchemas.map((item) => (item.id === schema.id ? updated : item))
      writeDb(db)
      await delay()
      return updated
    },
    async publish(id: string) {
      const db = readDb()
      const schema = db.entitySchemas.find((item) => item.id === id)
      if (!schema) throw new Error('Entity schema not found')
      schema.status = 'active'
      schema.updatedAt = nowIso()
      grantDefaultPermissions(db, schema.id)
      ensureLayer(db, schema)
      ensureWorkflow(db, schema)
      writeDb(db)
      await delay()
      return schema
    },
    async archive(id: string) {
      const db = readDb()
      const schema = db.entitySchemas.find((item) => item.id === id)
      if (!schema) throw new Error('Entity schema not found')
      schema.status = 'archived'
      schema.updatedAt = nowIso()
      writeDb(db)
      await delay()
      return schema
    },
    async duplicate(id: string) {
      const db = readDb()
      const source = db.entitySchemas.find((item) => item.id === id)
      if (!source) throw new Error('Entity schema not found')
      const timestamp = nowIso()
      const copy: EntitySchema = {
        ...source,
        id: createId('ent'),
        name: `${source.name} copy`,
        code: uniqueSystemCode(`${source.name} copy`, db.entitySchemas.map((schema) => schema.code), 'entity'),
        status: 'draft',
        fields: source.fields.map((field) => ({ ...field, id: createId('fld') })),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      copy.fields = normalizeFields(copy.fields)
      db.entitySchemas.push(copy)
      writeDb(db)
      await delay()
      return copy
    },
  },

  entityObjects: {
    async listAll() {
      await delay()
      return readDb().entityObjects
    },
    async listByEntity(entityId: string) {
      await delay()
      return readDb().entityObjects.filter((object) => object.entityId === entityId)
    },
    async getById(id: string) {
      await delay()
      return readDb().entityObjects.find((object) => object.id === id)
    },
    async create(input: CreateEntityObjectInput) {
      const db = readDb()
      const workflow = db.workflows.find((item) => item.entityId === input.entityId && item.status === 'active')
      const initialState = workflow?.states.find((state) => state.initial)
      const timestamp = nowIso()
      const object: EntityObject = {
        id: createId('obj'),
        entityId: input.entityId,
        values: input.values,
        geometry: input.geometry,
        status: initialState?.code ?? 'active',
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
      writeDb(db)
      await delay()
      return object
    },
    async update(input: UpdateEntityObjectInput) {
      const db = readDb()
      const object = db.entityObjects.find((item) => item.id === input.id)
      if (!object) throw new Error('Entity object not found')
      object.values = input.values
      object.geometry = input.geometry
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
      writeDb(db)
      await delay()
      return object
    },
    async delete(id: string) {
      const db = readDb()
      db.entityObjects = db.entityObjects.filter((object) => object.id !== id)
      writeDb(db)
      await delay()
    },
  },

  dictionaries: {
    async list() {
      await delay()
      return readDb().dictionaries
    },
    async save(dictionary: Dictionary) {
      const db = readDb()
      const existing = db.dictionaries.find((item) => item.id === dictionary.id)
      const { dictionary: normalized, itemCodeChanges } = normalizeDictionary(dictionary, existing, db)
      migrateEnumItemCodes(db, normalized, itemCodeChanges)
      const exists = db.dictionaries.some((item) => item.id === dictionary.id)
      db.dictionaries = exists
        ? db.dictionaries.map((item) => (item.id === dictionary.id ? normalized : item))
        : [...db.dictionaries, normalized]
      writeDb(db)
      await delay()
      return normalized
    },
    async delete(id: string) {
      const db = readDb()
      db.dictionaries = db.dictionaries.filter((dictionary) => dictionary.id !== id)
      db.entitySchemas = db.entitySchemas.map((schema) => ({
        ...schema,
        fields: schema.fields.map((field) => (field.enumId === id ? { ...field, enumId: undefined } : field)),
      }))
      writeDb(db)
      await delay()
    },
    async addItem(dictionaryId: string, name: string) {
      const db = readDb()
      const dictionary = db.dictionaries.find((item) => item.id === dictionaryId)
      if (!dictionary) throw new Error('Dictionary not found')
      const item: DictionaryItem = {
        id: createId('di'),
        code: uniqueSystemCode(name, dictionary.items.map((candidate) => candidate.code), 'value'),
        name,
        active: true,
      }
      dictionary.items.push(item)
      writeDb(db)
      await delay()
      return item
    },
  },

  users: {
    async authenticate(login: string, password: string) {
      await delay()
      const db = readDb()
      return db.users.find((user) => user.login === login && user.password === password && user.status === 'active')
    },
    async list() {
      await delay()
      return readDb().users
    },
    async save(user: User) {
      const db = readDb()
      db.users = db.users.some((item) => item.id === user.id)
        ? db.users.map((item) => (item.id === user.id ? user : item))
        : [...db.users, user]
      writeDb(db)
      await delay()
      return user
    },
  },

  roles: {
    async list() {
      await delay()
      return readDb().roles
    },
    async save(role: Role) {
      const db = readDb()
      const normalized: Role = {
        ...role,
        code: uniqueSystemCode(role.name, db.roles.filter((item) => item.id !== role.id).map((item) => item.code), 'role'),
      }
      db.roles = db.roles.map((item) => (item.id === role.id ? normalized : item))
      writeDb(db)
      await delay()
      return normalized
    },
  },

  organizations: {
    async list() {
      await delay()
      return readDb().organizations
    },
    async save(organization: Organization) {
      const db = readDb()
      db.organizations = db.organizations.some((item) => item.id === organization.id)
        ? db.organizations.map((item) => (item.id === organization.id ? organization : item))
        : [...db.organizations, organization]
      writeDb(db)
      await delay()
      return organization
    },
  },

  workflows: {
    async list() {
      await delay()
      return readDb().workflows
    },
    async getById(id: string) {
      await delay()
      return readDb().workflows.find((workflow) => workflow.id === id)
    },
    async getByEntity(entityId: string) {
      await delay()
      return readDb().workflows.find((workflow) => workflow.entityId === entityId && workflow.status === 'active')
    },
    async save(workflow: Workflow) {
      const db = readDb()
      const existing = db.workflows.find((item) => item.id === workflow.id)
      const { workflow: normalized, stateCodeChanges } = normalizeWorkflow(workflow, existing)
      migrateWorkflowStateCodes(db, normalized.entityId, stateCodeChanges)
      db.workflows = db.workflows.some((item) => item.id === workflow.id)
        ? db.workflows.map((item) => (item.id === workflow.id ? normalized : item))
        : [...db.workflows, normalized]
      writeDb(db)
      await delay()
      return normalized
    },
    async applyTransition(objectId: string, transitionId: string, actorId: string) {
      const db = readDb()
      const object = db.entityObjects.find((item) => item.id === objectId)
      if (!object) throw new Error('Entity object not found')
      const workflow = db.workflows.find((item) => item.entityId === object.entityId && item.status === 'active')
      const transition = workflow?.transitions.find((item) => item.id === transitionId)
      if (!workflow || !transition) throw new Error('Workflow transition not found')
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
        title: `Статус: ${previous} → ${object.status}`,
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
      writeDb(db)
      await delay()
      return object
    },
  },

  geoRules: {
    async list() {
      await delay()
      return readDb().geoRules
    },
    async save(rule: GeoRule) {
      const db = readDb()
      db.geoRules = db.geoRules.some((item) => item.id === rule.id)
        ? db.geoRules.map((item) => (item.id === rule.id ? rule : item))
        : [...db.geoRules, rule]
      writeDb(db)
      await delay()
      return rule
    },
    async validate(object: EntityObject): Promise<GeoValidationResult> {
      const db = readDb()
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
      return readDb().layers
    },
    async save(layer: Layer) {
      const db = readDb()
      db.layers = db.layers.some((item) => item.id === layer.id)
        ? db.layers.map((item) => (item.id === layer.id ? layer : item))
        : [...db.layers, layer]
      writeDb(db)
      await delay()
      return layer
    },
  },

  tasks: {
    async list() {
      await delay()
      return readDb().tasks
    },
    async listByAssignee(userId: string) {
      await delay()
      return readDb().tasks.filter((task) => task.assigneeId === userId)
    },
    async complete(taskId: string) {
      const db = readDb()
      const task = db.tasks.find((item) => item.id === taskId)
      if (task) task.status = 'done'
      writeDb(db)
      await delay()
      return task
    },
  },

  attachments: {
    async listByObject(entityId: string, objectId: string) {
      await delay()
      return readDb().attachments.filter((item) => item.entityId === entityId && item.objectId === objectId)
    },
    async add(entityId: string, objectId: string, actorId: string, name: string) {
      const db = readDb()
      const attachment: Attachment = {
        id: createId('att'),
        entityId,
        objectId,
        name,
        type: name.split('.').pop()?.toUpperCase() ?? 'FILE',
        date: nowIso(),
        authorId: actorId,
        size: '128 КБ',
      }
      db.attachments.unshift(attachment)
      db.auditEvents.unshift({
        id: createId('aud'),
        entityId,
        objectId,
        at: attachment.date,
        actorId,
        kind: 'document',
        title: `Добавлен документ: ${name}`,
      })
      writeDb(db)
      await delay()
      return attachment
    },
    async delete(id: string) {
      const db = readDb()
      db.attachments = db.attachments.filter((item) => item.id !== id)
      writeDb(db)
      await delay()
    },
  },

  auditEvents: {
    async listByObject(entityId: string, objectId: string) {
      await delay()
      return readDb().auditEvents.filter((item) => item.entityId === entityId && item.objectId === objectId)
    },
    async add(event: AuditEvent) {
      const db = readDb()
      db.auditEvents.unshift(event)
      writeDb(db)
      await delay()
      return event
    },
  },

  settings: {
    async get() {
      await delay()
      return readDb().settings
    },
    async save(settings: PlatformSettings) {
      const db = readDb()
      db.settings = settings
      writeDb(db)
      await delay()
      return settings
    },
  },
}

function readDb(): AppDatabase {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seeded = createSeedDatabase()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  }
  const db = migrateDb(JSON.parse(raw) as AppDatabase)
  writeDb(db)
  return db
}

function writeDb(db: AppDatabase): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

function migrateDb(db: AppDatabase): AppDatabase {
  const dictionaryEntityByCode: Record<string, string> = {
    work_types: 'ent_orders',
    playground_condition: 'ent_playgrounds',
    parking_type: 'ent_orders',
  }
  const fallbackEntityId = db.entitySchemas[0]?.id ?? 'ent_orders'
  return {
    ...db,
    dictionaries: db.dictionaries.map((dictionary) => ({
      ...dictionary,
      entityId: dictionary.entityId ?? dictionaryEntityByCode[dictionary.code] ?? fallbackEntityId,
    })),
  }
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
    return { ...field, code: newCode, order: index + 1 }
  })

  return {
    schema: {
      ...schema,
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
    return { ...field, code, order: index + 1 }
  })
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
  const palette = [
    ['#2563eb', '#1d4ed8'],
    ['#10b981', '#047857'],
    ['#f97316', '#c2410c'],
    ['#7c3aed', '#5b21b6'],
  ]
  const [fill, stroke] = palette[db.layers.length % palette.length]
  db.layers.push({
    id: createId('layer'),
    name: schema.name,
    entityId: schema.id,
    source: 'entity',
    geometryType: schema.geometryType,
    visibleByDefault: true,
    selectable: true,
    opacity: 0.72,
    style: { fill, stroke, strokeWidth: 2, pointSize: 8 },
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
