export type GeometryType = 'none' | 'point' | 'lineString' | 'polygon'
export type EntityStatus = 'draft' | 'active' | 'archived'
export type FieldType =
  | 'string'
  | 'text'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'reference'
  | 'file'

export type ObjectValue = string | number | boolean | string[] | null
export type EntityObjectValues = Record<string, ObjectValue>

export interface EntitySchema {
  id: string
  code: string
  name: string
  description?: string
  geometryType: GeometryType
  fields: EntityField[]
  status: EntityStatus
  createdAt: string
  updatedAt: string
}

export interface EntityField {
  id: string
  code: string
  name: string
  type: FieldType
  required: boolean
  listVisible: boolean
  cardVisible: boolean
  searchable: boolean
  filterable: boolean
  order: number
  enumId?: string
  referenceEntityId?: string
}

export type Coordinates = [number, number]
export type DomainGeometry =
  | { type: 'Point'; coordinates: Coordinates }
  | { type: 'LineString'; coordinates: Coordinates[] }
  | { type: 'Polygon'; coordinates: Coordinates[][] }

export interface EntityObject {
  id: string
  entityId: string
  values: EntityObjectValues
  geometry?: DomainGeometry
  status?: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export interface Dictionary {
  id: string
  entityId: string
  code: string
  name: string
  items: DictionaryItem[]
}

export interface DictionaryItem {
  id: string
  code: string
  name: string
  active: boolean
}

export interface Permission {
  entityId?: string
  system?: string
  view: boolean
  create: boolean
  edit: boolean
  delete: boolean
  transition: boolean
}

export interface Role {
  id: string
  code: string
  name: string
  permissions: Permission[]
}

export interface Organization {
  id: string
  name: string
  parentId?: string
}

export interface User {
  id: string
  login: string
  password: string
  lastName: string
  firstName: string
  middleName?: string
  organizationId: string
  roleIds: string[]
  status: 'active' | 'blocked'
}

export interface Workflow {
  id: string
  entityId: string
  name: string
  status: EntityStatus
  states: WorkflowState[]
  transitions: WorkflowTransition[]
}

export interface WorkflowState {
  id: string
  code: string
  name: string
  initial: boolean
  final: boolean
  x: number
  y: number
}

export interface WorkflowTransition {
  id: string
  name: string
  fromStateId: string
  toStateId: string
  allowedRoleIds: string[]
  validateRequiredFields: boolean
  validateGeoRules: boolean
}

export interface Task {
  id: string
  title: string
  entityId: string
  objectId: string
  assigneeId: string
  dueDate: string
  status: 'new' | 'inProgress' | 'done' | 'overdue'
}

export type GeoOperator = 'INTERSECTS' | 'WITHIN' | 'DISTANCE'

export interface GeoRule {
  id: string
  name: string
  entityId: string
  operator: GeoOperator
  targetEntityId: string
  distanceMeters?: number
  severity: 'warning' | 'error'
  message: string
  blockWorkflowTransition: boolean
  status: EntityStatus
}

export interface Layer {
  id: string
  name: string
  entityId: string
  source: 'entity'
  geometryType: GeometryType
  visibleByDefault: boolean
  selectable: boolean
  opacity: number
  style: {
    fill: string
    stroke: string
    strokeWidth: number
    pointSize: number
  }
}

export interface Attachment {
  id: string
  entityId: string
  objectId: string
  name: string
  type: string
  date: string
  authorId: string
  size: string
}

export interface AuditEvent {
  id: string
  entityId: string
  objectId: string
  at: string
  actorId: string
  kind: 'change' | 'workflow' | 'document'
  title: string
  details?: string
}

export interface GeoValidationConflict {
  rule: GeoRule
  targetObject: EntityObject
  targetSchema: EntitySchema
}

export interface GeoValidationResult {
  ok: boolean
  conflicts: GeoValidationConflict[]
}

export interface PlatformSettings {
  platformName: string
  municipalityName: string
  mapCenter: Coordinates
  mapZoom: number
  sessionTimeoutMinutes: number
  dateTimeFormat: string
}

export interface AppDatabase {
  entitySchemas: EntitySchema[]
  entityObjects: EntityObject[]
  dictionaries: Dictionary[]
  users: User[]
  roles: Role[]
  organizations: Organization[]
  workflows: Workflow[]
  tasks: Task[]
  geoRules: GeoRule[]
  layers: Layer[]
  attachments: Attachment[]
  auditEvents: AuditEvent[]
  settings: PlatformSettings
}
