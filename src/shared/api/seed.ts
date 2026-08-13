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
} from '../types/domain'

const createdAt = '2026-08-10T09:00:00.000Z'

const dictionaries: Dictionary[] = [
  {
    id: 'dict_work_types',
    entityId: 'ent_orders',
    code: 'work_types',
    name: 'Типы работ',
    items: [
      { id: 'wi_road', code: 'road_repair', name: 'Ремонт дороги', active: true },
      { id: 'wi_pipe', code: 'pipe_repair', name: 'Ремонт сетей', active: true },
      { id: 'wi_land', code: 'landscape', name: 'Благоустройство', active: true },
    ],
  },
  {
    id: 'dict_playground_condition',
    entityId: 'ent_playgrounds',
    code: 'playground_condition',
    name: 'Состояния площадок',
    items: [
      { id: 'pc_ok', code: 'good', name: 'Исправна', active: true },
      { id: 'pc_watch', code: 'attention', name: 'Требует внимания', active: true },
      { id: 'pc_bad', code: 'critical', name: 'Аварийная', active: true },
    ],
  },
  {
    id: 'dict_parking_type',
    entityId: 'ent_orders',
    code: 'parking_type',
    name: 'Типы парковок',
    items: [
      { id: 'pt_public', code: 'public', name: 'Общественная', active: true },
      { id: 'pt_resident', code: 'resident', name: 'Резидентская', active: true },
      { id: 'pt_service', code: 'service', name: 'Служебная', active: true },
    ],
  },
]

const entitySchemas: EntitySchema[] = [
  {
    id: 'ent_orders',
    code: 'orders',
    name: 'Ордера',
    description: 'Разрешения на земляные и дорожные работы',
    geometryType: 'polygon',
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    fields: [
      field('fld_order_number', 'number', 'Номер', 'string', 1, { searchable: true }),
      field('fld_order_contractor', 'contractor', 'Исполнитель', 'string', 2, { searchable: true, filterable: true }),
      field('fld_order_work_type', 'workType', 'Тип работ', 'enum', 3, { enumId: 'dict_work_types', filterable: true }),
      field('fld_order_start', 'startDate', 'Начало', 'date', 4, { filterable: true }),
      field('fld_order_end', 'endDate', 'Окончание', 'date', 5, { filterable: true }),
      field('fld_order_description', 'description', 'Описание', 'text', 6, { listVisible: false }),
      field('fld_order_responsible', 'responsible', 'Ответственный', 'string', 7, { searchable: true }),
    ],
  },
  {
    id: 'ent_warranty',
    code: 'warranty_areas',
    name: 'Гарантийные участки',
    description: 'Геометрии участков с действующей гарантией подрядчиков',
    geometryType: 'polygon',
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    fields: [
      field('fld_warranty_number', 'number', 'Номер', 'string', 1, { searchable: true }),
      field('fld_warranty_address', 'address', 'Адрес', 'string', 2, { searchable: true }),
      field('fld_warranty_start', 'startDate', 'Начало гарантии', 'date', 3),
      field('fld_warranty_end', 'endDate', 'Гарантия до', 'date', 4),
      field('fld_warranty_contractor', 'contractor', 'Подрядчик', 'string', 5, { searchable: true }),
    ],
  },
  {
    id: 'ent_playgrounds',
    code: 'playgrounds',
    name: 'Детские площадки',
    description: 'Паспортизация и состояние городских детских площадок',
    geometryType: 'point',
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    fields: [
      field('fld_play_name', 'name', 'Название', 'string', 1, { searchable: true }),
      field('fld_play_address', 'address', 'Адрес', 'string', 2, { searchable: true }),
      field('fld_play_condition', 'condition', 'Состояние', 'enum', 3, {
        enumId: 'dict_playground_condition',
        filterable: true,
      }),
      field('fld_play_year', 'installationYear', 'Год установки', 'integer', 4),
      field('fld_play_org', 'responsibleOrganization', 'Ответственная организация', 'string', 5),
    ],
  },
]

const organizations: Organization[] = [
  { id: 'org_city', name: 'Администрация Нижнего Новгорода' },
  { id: 'org_ati', name: 'АТИ', parentId: 'org_city' },
  { id: 'org_transport', name: 'Департамент транспорта', parentId: 'org_city' },
  { id: 'org_housing', name: 'Департамент ЖКХ', parentId: 'org_city' },
  { id: 'org_property', name: 'Департамент имущества', parentId: 'org_city' },
]

const roles: Role[] = [
  {
    id: 'role_admin',
    code: 'admin',
    name: 'Admin',
    permissions: [{ system: '*', view: true, create: true, edit: true, delete: true, transition: true }],
  },
  {
    id: 'role_operator',
    code: 'operator',
    name: 'Operator',
    permissions: entitySchemas.map((schema) => ({
      entityId: schema.id,
      view: true,
      create: true,
      edit: schema.code !== 'warranty_areas',
      delete: false,
      transition: schema.code === 'orders',
    })),
  },
  {
    id: 'role_manager',
    code: 'manager',
    name: 'Manager',
    permissions: entitySchemas.map((schema) => ({
      entityId: schema.id,
      view: true,
      create: false,
      edit: false,
      delete: false,
      transition: schema.code === 'orders',
    })),
  },
  {
    id: 'role_viewer',
    code: 'viewer',
    name: 'Viewer',
    permissions: entitySchemas.map((schema) => ({
      entityId: schema.id,
      view: true,
      create: false,
      edit: false,
      delete: false,
      transition: false,
    })),
  },
]

const users: User[] = [
  {
    id: 'usr_admin',
    login: 'admin',
    password: 'admin',
    lastName: 'Смирнова',
    firstName: 'Анна',
    middleName: 'Петровна',
    organizationId: 'org_ati',
    roleIds: ['role_admin'],
    status: 'active',
  },
  {
    id: 'usr_operator',
    login: 'operator',
    password: 'operator',
    lastName: 'Иванов',
    firstName: 'Илья',
    middleName: 'Игоревич',
    organizationId: 'org_ati',
    roleIds: ['role_operator'],
    status: 'active',
  },
  {
    id: 'usr_manager',
    login: 'manager',
    password: 'manager',
    lastName: 'Кузнецова',
    firstName: 'Мария',
    middleName: 'Олеговна',
    organizationId: 'org_transport',
    roleIds: ['role_manager'],
    status: 'active',
  },
  {
    id: 'usr_viewer',
    login: 'viewer',
    password: 'viewer',
    lastName: 'Орлов',
    firstName: 'Денис',
    organizationId: 'org_housing',
    roleIds: ['role_viewer'],
    status: 'active',
  },
]

const entityObjects: EntityObject[] = [
  {
    id: 'obj_order_1432',
    entityId: 'ent_orders',
    status: 'active',
    createdAt,
    updatedAt: '2026-08-10T14:43:00.000Z',
    createdBy: 'usr_operator',
    updatedBy: 'usr_manager',
    values: {
      number: '1432',
      contractor: 'НН Дорстрой',
      workType: 'road_repair',
      startDate: '2026-08-10',
      endDate: '2026-08-20',
      description: 'Ремонт покрытия и восстановление бордюра после сетевых работ.',
      responsible: 'Иванов И.И.',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [44.045, 56.324],
          [44.052, 56.324],
          [44.052, 56.329],
          [44.045, 56.329],
          [44.045, 56.324],
        ],
      ],
    },
  },
  {
    id: 'obj_order_1441',
    entityId: 'ent_orders',
    status: 'review',
    createdAt: '2026-08-09T11:10:00.000Z',
    updatedAt: '2026-08-10T12:20:00.000Z',
    createdBy: 'usr_operator',
    updatedBy: 'usr_operator',
    values: {
      number: '1441',
      contractor: 'Теплосеть-Сервис',
      workType: 'pipe_repair',
      startDate: '2026-08-12',
      endDate: '2026-08-17',
      description: 'Замена участка теплотрассы.',
      responsible: 'Петров П.П.',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [43.982, 56.303],
          [43.99, 56.303],
          [43.99, 56.309],
          [43.982, 56.309],
          [43.982, 56.303],
        ],
      ],
    },
  },
  {
    id: 'obj_warranty_342',
    entityId: 'ent_warranty',
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    createdBy: 'usr_admin',
    updatedBy: 'usr_admin',
    values: {
      number: '342',
      address: 'ул. Родионова, 154',
      startDate: '2025-09-14',
      endDate: '2027-09-14',
      contractor: 'НН Дорстрой',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [44.048, 56.322],
          [44.057, 56.322],
          [44.057, 56.331],
          [44.048, 56.331],
          [44.048, 56.322],
        ],
      ],
    },
  },
  {
    id: 'obj_playground_1',
    entityId: 'ent_playgrounds',
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    createdBy: 'usr_admin',
    updatedBy: 'usr_admin',
    values: {
      name: 'Площадка на Верхне-Волжской',
      address: 'Верхне-Волжская наб., 8',
      condition: 'good',
      installationYear: 2021,
      responsibleOrganization: 'Департамент ЖКХ',
    },
    geometry: { type: 'Point', coordinates: [44.018, 56.329] },
  },
]

const workflows: Workflow[] = [
  {
    id: 'wf_orders',
    entityId: 'ent_orders',
    name: 'Жизненный цикл ордера',
    status: 'active',
    states: [
      state('st_draft', 'draft', 'Черновик', true, false, 60, 72),
      state('st_review', 'review', 'На проверке', false, false, 260, 72),
      state('st_approval', 'approval', 'Согласование', false, false, 460, 72),
      state('st_active', 'active', 'В работе', false, false, 660, 72),
      state('st_closed', 'closed', 'Закрыт', false, true, 860, 72),
    ],
    transitions: [
      transition('tr_submit', 'Отправить на проверку', 'st_draft', 'st_review', ['role_operator', 'role_admin'], true, true),
      transition('tr_approve', 'Согласовать', 'st_review', 'st_approval', ['role_manager', 'role_admin'], true, true),
      transition('tr_start', 'Начать работы', 'st_approval', 'st_active', ['role_manager', 'role_admin'], false, false),
      transition('tr_close', 'Закрыть', 'st_active', 'st_closed', ['role_manager', 'role_admin'], false, false),
    ],
  },
]

const geoRules: GeoRule[] = [
  {
    id: 'geo_warranty_intersects',
    name: 'Проверка гарантий',
    entityId: 'ent_orders',
    operator: 'INTERSECTS',
    targetEntityId: 'ent_warranty',
    severity: 'error',
    message: 'Ордер пересекается с гарантийным участком',
    blockWorkflowTransition: true,
    status: 'active',
  },
]

const layers: Layer[] = [
  layer('layer_orders', 'Ордера', 'ent_orders', 'polygon', true, '#2563eb', '#1d4ed8'),
  layer('layer_warranty', 'Гарантийные участки', 'ent_warranty', 'polygon', true, '#f59e0b', '#d97706'),
  layer('layer_playgrounds', 'Детские площадки', 'ent_playgrounds', 'point', true, '#10b981', '#059669'),
]

const tasks: Task[] = [
  {
    id: 'task_order_1441',
    title: 'Проверить ордер №1441',
    entityId: 'ent_orders',
    objectId: 'obj_order_1441',
    assigneeId: 'usr_manager',
    dueDate: '2026-08-12',
    status: 'new',
  },
]

const attachments: Attachment[] = [
  attachment('att_1', 'Ордер №1432.pdf', 'PDF', '1.2 МБ'),
  attachment('att_2', 'Схема работ.pdf', 'PDF', '840 КБ'),
  attachment('att_3', 'Согласование.docx', 'DOCX', '320 КБ'),
  attachment('att_4', 'Фото участка.jpg', 'JPG', '2.8 МБ'),
]

const auditEvents: AuditEvent[] = [
  audit('aud_1', 'workflow', 'Статус: На проверке → В работе', '10.08.2026 14:43'),
  audit('aud_2', 'change', 'Изменена геометрия', '10.08.2026 13:12'),
  audit('aud_3', 'change', 'Дата окончания: 15.08 → 20.08', '10.08.2026 12:42'),
  audit('aud_4', 'document', 'Добавлен документ: Схема работ.pdf', '10.08.2026 12:30'),
]

export function createSeedDatabase(): AppDatabase {
  return {
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
    settings: {
      platformName: 'Муниципальная платформа',
      municipalityName: 'Нижний Новгород',
      mapCenter: [44.0065, 56.3269],
      mapZoom: 12,
      sessionTimeoutMinutes: 60,
      dateTimeFormat: 'dd.MM.yyyy HH:mm',
    },
    userSettings: users.map((user) => defaultUserSettings(user.id)),
  }
}

function defaultUserSettings(userId: string): UserSettings {
  return {
    userId,
    home: {
      summaryBlocks: [
        {
          id: `sum_${userId}_orders_count`,
          entityId: 'ent_orders',
          fieldCode: '',
          metric: 'count',
          title: 'Всего ордеров',
          showInfo: true,
          description: 'Общее количество объектов сущности «Ордера».',
          widthPx: 220,
          order: 1,
          filters: [],
        },
        {
          id: `sum_${userId}_orders_created_today`,
          entityId: 'ent_orders',
          fieldCode: '',
          metric: 'count',
          title: 'Ордера, заведённые сегодня',
          showInfo: true,
          description: 'Количество ордеров, у которых дата создания совпадает с текущей датой.',
          widthPx: 280,
          order: 2,
          filters: [
            { id: `flt_${userId}_orders_created_today`, fieldCode: '__createdAt', operator: 'today', value: '' },
          ],
        },
        {
          id: `sum_${userId}_orders_active_future`,
          entityId: 'ent_orders',
          fieldCode: '',
          metric: 'count',
          title: 'Ордера в работе',
          showInfo: true,
          description: 'Количество ордеров со статусом «В работе» и датой окончания позже текущей даты.',
          widthPx: 460,
          order: 3,
          filters: [
            { id: `flt_${userId}_orders_active`, fieldCode: '__status', operator: 'equals', value: 'active' },
            { id: `flt_${userId}_orders_end_future`, fieldCode: 'endDate', operator: 'afterToday', value: '' },
          ],
        },
        {
          id: `sum_${userId}_orders_contractors`,
          entityId: 'ent_orders',
          fieldCode: 'contractor',
          metric: 'unique',
          title: 'Подрядчики',
          showInfo: true,
          description: 'Количество уникальных значений в поле «Исполнитель».',
          widthPx: 220,
          order: 4,
          filters: [],
        },
        {
          id: `sum_${userId}_warranty_count`,
          entityId: 'ent_warranty',
          fieldCode: '',
          metric: 'count',
          title: 'Гарантийные участки',
          showInfo: true,
          description: 'Общее количество объектов сущности «Гарантийные участки».',
          widthPx: 260,
          order: 5,
          filters: [],
        },
        {
          id: `sum_${userId}_playgrounds_year`,
          entityId: 'ent_playgrounds',
          fieldCode: 'installationYear',
          metric: 'average',
          title: 'Средний год установки',
          showInfo: true,
          description: 'Среднее значение поля «Год установки» по детским площадкам.',
          widthPx: 460,
          order: 6,
          filters: [],
        },
      ],
    },
  }
}

function field(
  id: string,
  code: string,
  name: string,
  type: EntitySchema['fields'][number]['type'],
  order: number,
  overrides: Partial<EntitySchema['fields'][number]> = {},
): EntitySchema['fields'][number] {
  return {
    id,
    code,
    name,
    type,
    required: true,
    listVisible: true,
    cardVisible: true,
    searchable: false,
    filterable: false,
    order,
    ...overrides,
  }
}

function state(
  id: string,
  code: string,
  name: string,
  initial: boolean,
  final: boolean,
  x: number,
  y: number,
): Workflow['states'][number] {
  return { id, code, name, initial, final, x, y }
}

function transition(
  id: string,
  name: string,
  fromStateId: string,
  toStateId: string,
  allowedRoleIds: string[],
  validateRequiredFields: boolean,
  validateGeoRules: boolean,
): Workflow['transitions'][number] {
  return { id, name, fromStateId, toStateId, allowedRoleIds, validateRequiredFields, validateGeoRules }
}

function layer(
  id: string,
  name: string,
  entityId: string,
  geometryType: Layer['geometryType'],
  visibleByDefault: boolean,
  fill: string,
  stroke: string,
): Layer {
  return {
    id,
    name,
    entityId,
    source: 'entity',
    geometryType,
    visibleByDefault,
    selectable: true,
    opacity: 0.74,
    style: { fill, stroke, strokeWidth: 2, pointSize: 8 },
  }
}

function attachment(id: string, name: string, type: string, size: string): Attachment {
  return {
    id,
    entityId: 'ent_orders',
    objectId: 'obj_order_1432',
    name,
    type,
    size,
    date: '2026-08-10T12:30:00.000Z',
    authorId: 'usr_operator',
  }
}

function audit(id: string, kind: AuditEvent['kind'], title: string, dateLabel: string): AuditEvent {
  const [day, month, yearAndTime] = dateLabel.split('.')
  const [year, time] = yearAndTime.split(' ')
  return {
    id,
    entityId: 'ent_orders',
    objectId: 'obj_order_1432',
    at: `${year}-${month}-${day}T${time}:00.000Z`,
    actorId: 'usr_operator',
    kind,
    title,
  }
}
