import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createId, nowIso } from '../shared/lib/id'
import { generateSystemCode } from '../shared/lib/codegen'
import { repositories } from '../shared/api/repositories'
import type {
  AppDatabase,
  Attachment,
  AuditEvent,
  Dictionary,
  EntityObject,
  EntityObjectValues,
  EntitySchema,
  GeoRule,
  GeoValidationResult,
  Layer,
  Organization,
  PlatformSettings,
  Role,
  Task,
  User,
  UserSettings,
  Workflow,
} from '../shared/types/domain'

export const usePlatformStore = defineStore('platform', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const entitySchemas = ref<EntitySchema[]>([])
  const entityObjects = ref<EntityObject[]>([])
  const dictionaries = ref<Dictionary[]>([])
  const users = ref<User[]>([])
  const roles = ref<Role[]>([])
  const organizations = ref<Organization[]>([])
  const workflows = ref<Workflow[]>([])
  const tasks = ref<Task[]>([])
  const geoRules = ref<GeoRule[]>([])
  const layers = ref<Layer[]>([])
  const attachments = ref<Attachment[]>([])
  const auditEvents = ref<AuditEvent[]>([])
  const settings = ref<PlatformSettings | null>(null)
  const userSettings = ref<UserSettings[]>([])

  const activeSchemas = computed(() => entitySchemas.value.filter((schema) => schema.status === 'active'))
  const runtimeSchemas = computed(() => activeSchemas.value.filter((schema) => schema.geometryType !== 'none' || schema.fields.length > 0))

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      applySnapshot(await repositories.database.snapshot())
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить данные'
    } finally {
      loading.value = false
    }
  }

  async function resetDemoData(): Promise<void> {
    applySnapshot(await repositories.database.reset())
  }

  function schemaById(id: string): EntitySchema | undefined {
    return entitySchemas.value.find((schema) => schema.id === id)
  }

  function schemaByCode(code: string): EntitySchema | undefined {
    return entitySchemas.value.find((schema) => schema.code === code)
  }

  function objectById(id: string): EntityObject | undefined {
    return entityObjects.value.find((object) => object.id === id)
  }

  function objectsByEntity(entityId: string): EntityObject[] {
    return entityObjects.value.filter((object) => object.entityId === entityId)
  }

  function dictionaryById(id?: string): Dictionary | undefined {
    return dictionaries.value.find((dictionary) => dictionary.id === id)
  }

  function workflowByEntity(entityId: string): Workflow | undefined {
    return workflows.value.find((workflow) => workflow.entityId === entityId && workflow.status === 'active')
  }

  function roleById(id: string): Role | undefined {
    return roles.value.find((role) => role.id === id)
  }

  function userById(id: string): User | undefined {
    return users.value.find((user) => user.id === id)
  }

  function userSettingsByUser(userId: string): UserSettings | undefined {
    return userSettings.value.find((item) => item.userId === userId)
  }

  async function createSchema(input: {
    name: string
    description?: string
    geometryType?: EntitySchema['geometryType']
  }): Promise<EntitySchema> {
    const schema = await repositories.entitySchemas.create(input)
    await refresh()
    return schema
  }

  async function saveSchema(schema: EntitySchema): Promise<EntitySchema> {
    const saved = await repositories.entitySchemas.save(schema)
    await refresh()
    return saved
  }

  async function publishSchema(id: string): Promise<EntitySchema> {
    const schema = await repositories.entitySchemas.publish(id)
    await refresh()
    return schema
  }

  async function archiveSchema(id: string): Promise<EntitySchema> {
    const schema = await repositories.entitySchemas.archive(id)
    await refresh()
    return schema
  }

  async function duplicateSchema(id: string): Promise<EntitySchema> {
    const schema = await repositories.entitySchemas.duplicate(id)
    await refresh()
    return schema
  }

  async function deleteSchema(id: string): Promise<void> {
    await repositories.entitySchemas.delete(id)
    await refresh()
  }

  async function createObject(input: {
    entityId: string
    values: EntityObjectValues
    geometry?: EntityObject['geometry']
    actorId: string
  }): Promise<EntityObject> {
    const object = await repositories.entityObjects.create(input)
    await refresh()
    return object
  }

  async function importObjects(inputs: Array<{
    entityId: string
    values: EntityObjectValues
    geometry?: EntityObject['geometry']
    actorId: string
  }>): Promise<EntityObject[]> {
    const objects = await repositories.entityObjects.createMany(inputs)
    await refresh()
    return objects
  }

  async function updateObject(input: {
    id: string
    values: EntityObjectValues
    geometry?: EntityObject['geometry']
    actorId: string
  }): Promise<EntityObject> {
    const object = await repositories.entityObjects.update(input)
    await refresh()
    return object
  }

  async function validateObject(object: EntityObject): Promise<GeoValidationResult> {
    return repositories.geoRules.validate(object)
  }

  async function applyWorkflowTransition(objectId: string, transitionId: string, actorId: string): Promise<EntityObject> {
    const object = await repositories.workflows.applyTransition(objectId, transitionId, actorId)
    await refresh()
    return object
  }

  async function saveWorkflow(workflow: Workflow): Promise<Workflow> {
    const saved = await repositories.workflows.save(workflow)
    await refresh()
    return saved
  }

  async function saveGeoRule(rule: GeoRule): Promise<GeoRule> {
    const saved = await repositories.geoRules.save(rule)
    await refresh()
    return saved
  }

  async function saveLayer(layer: Layer): Promise<Layer> {
    const saved = await repositories.layers.save(layer)
    await refresh()
    return saved
  }

  async function saveDictionary(dictionary: Dictionary): Promise<Dictionary> {
    const saved = await repositories.dictionaries.save(dictionary)
    await refresh()
    return saved
  }

  async function deleteDictionary(id: string): Promise<void> {
    await repositories.dictionaries.delete(id)
    await refresh()
  }

  async function addDictionaryItem(dictionaryId: string, name: string): Promise<void> {
    await repositories.dictionaries.addItem(dictionaryId, name)
    await refresh()
  }

  async function saveUser(user: User): Promise<User> {
    const saved = await repositories.users.save(user)
    await refresh()
    return saved
  }

  async function saveRole(role: Role): Promise<Role> {
    const saved = await repositories.roles.save(role)
    await refresh()
    return saved
  }

  async function saveOrganization(organization: Organization): Promise<Organization> {
    const saved = await repositories.organizations.save(organization)
    await refresh()
    return saved
  }

  async function addAttachment(entityId: string, objectId: string, actorId: string, name: string): Promise<void> {
    await repositories.attachments.add(entityId, objectId, actorId, name)
    await refresh()
  }

  async function deleteAttachment(id: string): Promise<void> {
    await repositories.attachments.delete(id)
    await refresh()
  }

  async function saveSettings(nextSettings: PlatformSettings): Promise<PlatformSettings> {
    const saved = await repositories.settings.save(nextSettings)
    await refresh()
    return saved
  }

  async function saveUserSettings(nextSettings: UserSettings): Promise<UserSettings> {
    const saved = await repositories.userSettings.save(nextSettings)
    await refresh()
    return saved
  }

  function attachmentsByObject(entityId: string, objectId: string): Attachment[] {
    return attachments.value.filter((attachment) => attachment.entityId === entityId && attachment.objectId === objectId)
  }

  function auditByObject(entityId: string, objectId: string): AuditEvent[] {
    return auditEvents.value.filter((event) => event.entityId === entityId && event.objectId === objectId)
  }

  function tasksForUser(userId: string): Task[] {
    return tasks.value.filter((task) => task.assigneeId === userId)
  }

  function createEmptyField(order: number): EntitySchema['fields'][number] {
    return {
      id: createId('fld'),
      name: `Поле ${order}`,
      code: generateSystemCode(`Поле ${order}`, 'field'),
      type: 'string',
      required: false,
      listVisible: true,
      cardVisible: true,
      searchable: true,
      filterable: true,
      order,
    }
  }

  function createNewDictionary(name: string, entityId: string): Dictionary {
    return {
      id: createId('dict'),
      entityId,
      name,
      code: generateSystemCode(name, 'dictionary'),
      items: [],
    }
  }

  function createNewGeoRule(entityId: string, targetEntityId: string): GeoRule {
    return {
      id: createId('geo'),
      name: 'Новое гео-правило',
      entityId,
      operator: 'INTERSECTS',
      targetEntityId,
      severity: 'error',
      message: 'Обнаружено пространственное пересечение',
      blockWorkflowTransition: true,
      status: 'draft',
    }
  }

  function createNewAuditEvent(
    entityId: string,
    objectId: string,
    actorId: string,
    title: string,
  ): AuditEvent {
    return {
      id: createId('aud'),
      entityId,
      objectId,
      actorId,
      at: nowIso(),
      kind: 'change',
      title,
    }
  }

  function applySnapshot(db: AppDatabase): void {
    entitySchemas.value = db.entitySchemas
    entityObjects.value = db.entityObjects
    dictionaries.value = db.dictionaries
    users.value = db.users
    roles.value = db.roles
    organizations.value = db.organizations
    workflows.value = db.workflows
    tasks.value = db.tasks
    geoRules.value = db.geoRules
    layers.value = db.layers
    attachments.value = db.attachments
    auditEvents.value = db.auditEvents
    settings.value = db.settings
    userSettings.value = db.userSettings
  }

  return {
    loading,
    error,
    entitySchemas,
    entityObjects,
    dictionaries,
    users,
    roles,
    organizations,
    workflows,
    tasks,
    geoRules,
    layers,
    attachments,
    auditEvents,
    settings,
    userSettings,
    activeSchemas,
    runtimeSchemas,
    refresh,
    resetDemoData,
    schemaById,
    schemaByCode,
    objectById,
    objectsByEntity,
    dictionaryById,
    workflowByEntity,
    roleById,
    userById,
    userSettingsByUser,
    createSchema,
    saveSchema,
    publishSchema,
    archiveSchema,
    duplicateSchema,
    deleteSchema,
    createObject,
    importObjects,
    updateObject,
    validateObject,
    applyWorkflowTransition,
    saveWorkflow,
    saveGeoRule,
    saveLayer,
    saveDictionary,
    deleteDictionary,
    addDictionaryItem,
    saveUser,
    saveRole,
    saveOrganization,
    addAttachment,
    deleteAttachment,
    saveSettings,
    saveUserSettings,
    attachmentsByObject,
    auditByObject,
    tasksForUser,
    createEmptyField,
    createNewDictionary,
    createNewGeoRule,
    createNewAuditEvent,
  }
})
