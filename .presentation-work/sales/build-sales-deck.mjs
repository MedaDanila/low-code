import fs from 'node:fs/promises'
import path from 'node:path'
import { Presentation, PresentationFile } from '@oai/artifact-tool'

const OUT = path.resolve('artifacts/municipal-gis-sales-deck.pptx')
const W = 1280
const H = 720

const c = {
  ink: '#0F172A',
  black: '#020617',
  muted: '#64748B',
  soft: '#F8FAFC',
  panel: '#F1F5F9',
  panel2: '#E2E8F0',
  line: '#CBD5E1',
  blue: '#2563EB',
  blue2: '#0EA5E9',
  green: '#059669',
  yellow: '#D97706',
  red: '#DC2626',
  violet: '#7C3AED',
}

const sources = [
  'README.md',
  'src/shared/types/domain.ts',
  'src/app/router/index.ts',
  'src/widgets/entity/EntityRegistry.vue',
  'src/widgets/entity/EntityForm.vue',
  'src/widgets/entity/EntityCard.vue',
  'src/widgets/map/MapCanvas.vue',
  'src/widgets/map/GeometryEditor.vue',
  'src/shared/lib/addressGeometry.ts',
  'src/shared/api/dadata.ts',
  'src/shared/api/nominatim.ts',
  'src/pages/admin/AdminImportPage.vue',
  'src/shared/lib/generatedApi.ts',
  'docs/postgres-3nf-schema.md',
]

const presentation = Presentation.create({ slideSize: { width: W, height: H } })

function addShape(slide, geometry, left, top, width, height, opts = {}) {
  return slide.shapes.add({
    geometry,
    name: opts.name,
    position: { left, top, width, height, rotation: opts.rotation },
    fill: opts.fill ?? 'none',
    line: opts.line ?? { style: 'solid', fill: 'none', width: 0 },
    borderRadius: opts.radius,
    shadow: opts.shadow,
    customPaths: opts.customPaths,
  })
}

function addText(slide, text, left, top, width, height, opts = {}) {
  const box = addShape(slide, 'textbox', left, top, width, height, {
    name: opts.name,
    fill: 'none',
    line: { style: 'solid', fill: 'none', width: 0 },
  })
  box.text = text
  box.text.style = {
    fontSize: opts.size ?? 24,
    bold: opts.bold ?? false,
    color: opts.color ?? c.ink,
    italic: opts.italic ?? false,
  }
  return box
}

function addSlide(title, kicker = '') {
  const slide = presentation.slides.add()
  slide.background.fill = 'white'
  addText(slide, kicker || 'LOW-CODE GIS PLATFORM', 72, 40, 360, 24, {
    size: 11,
    bold: true,
    color: c.blue,
  })
  addText(slide, title, 72, 78, 880, 82, {
    size: 38,
    bold: true,
    color: c.black,
  })
  addShape(slide, 'line', 72, 188, 1136, 1, {
    line: { style: 'solid', fill: c.line, width: 1 },
  })
  return slide
}

function addFooter(slide, n) {
  addText(slide, 'Муниципальная GIS-платформа', 72, 670, 340, 18, {
    size: 10,
    color: c.muted,
  })
  addText(slide, String(n).padStart(2, '0'), 1164, 668, 44, 20, {
    size: 11,
    bold: true,
    color: c.muted,
  })
}

function addNotes(slide, lines) {
  slide.speakerNotes.textFrame.setText([
    ...lines,
    '',
    '[Источники]',
    ...sources.map((item) => `- ${item}`),
  ])
  slide.speakerNotes.setVisible(true)
}

function pill(slide, label, left, top, width, color = c.blue) {
  addShape(slide, 'roundRect', left, top, width, 34, {
    fill: `${color}14`,
    line: { style: 'solid', fill: `${color}40`, width: 1 },
    radius: 17,
  })
  addText(slide, label, left + 14, top + 8, width - 28, 18, {
    size: 12,
    bold: true,
    color,
  })
}

function card(slide, left, top, width, height, opts = {}) {
  return addShape(slide, 'roundRect', left, top, width, height, {
    fill: opts.fill ?? c.soft,
    line: { style: 'solid', fill: opts.line ?? c.line, width: opts.lineWidth ?? 1 },
    radius: opts.radius ?? 8,
    shadow: opts.shadow,
  })
}

function cardTitle(slide, title, body, left, top, width, accent = c.blue) {
  addShape(slide, 'rect', left, top, 5, 56, { fill: accent, line: { style: 'solid', fill: accent, width: 0 } })
  addText(slide, title, left + 18, top - 1, width - 24, 26, { size: 19, bold: true, color: c.black })
  addText(slide, body, left + 18, top + 32, width - 28, 84, { size: 15, color: c.muted })
}

function metricCard(slide, label, value, detail, left, top, width, color = c.blue) {
  card(slide, left, top, width, 126, { fill: 'white', shadow: 'shadow-sm' })
  addShape(slide, 'ellipse', left + 22, top + 20, 16, 16, { fill: color, line: { style: 'solid', fill: color, width: 0 } })
  addText(slide, label, left + 50, top + 18, width - 70, 22, { size: 14, bold: true, color: c.ink })
  addText(slide, value, left + 22, top + 48, width - 44, 42, { size: 30, bold: true, color: c.black })
  addText(slide, detail, left + 22, top + 94, width - 44, 24, { size: 12, color: c.muted })
}

function moduleBox(slide, title, body, left, top, width, height, color) {
  card(slide, left, top, width, height, { fill: 'white', shadow: 'shadow-sm' })
  addShape(slide, 'roundRect', left + 18, top + 18, 34, 34, {
    fill: `${color}18`,
    line: { style: 'solid', fill: `${color}44`, width: 1 },
    radius: 8,
  })
  addShape(slide, 'ellipse', left + 28, top + 28, 14, 14, { fill: color, line: { style: 'solid', fill: color, width: 0 } })
  addText(slide, title, left + 64, top + 17, width - 82, 26, { size: 18, bold: true, color: c.black })
  addText(slide, body, left + 64, top + 49, width - 82, height - 60, { size: 14, color: c.muted })
}

function step(slide, n, title, body, left, top, width) {
  card(slide, left, top, width, 154, { fill: 'white' })
  addShape(slide, 'ellipse', left + 20, top + 22, 36, 36, { fill: c.black, line: { style: 'solid', fill: c.black, width: 0 } })
  addText(slide, String(n), left + 32, top + 30, 14, 18, { size: 13, bold: true, color: 'white' })
  addText(slide, title, left + 70, top + 20, width - 90, 44, { size: 18, bold: true, color: c.black })
  addText(slide, body, left + 70, top + 74, width - 88, 64, { size: 14, color: c.muted })
}

function mapVisual(slide, left, top, width, height) {
  card(slide, left, top, width, height, { fill: '#F8FBFF', line: '#D8E4F5', radius: 8 })
  for (let x = left + 28; x < left + width - 20; x += 54) {
    addShape(slide, 'line', x, top + 20, 1, height - 40, {
      line: { style: 'solid', fill: '#DBEAFE', width: 1 },
    })
  }
  for (let y = top + 28; y < top + height - 20; y += 46) {
    addShape(slide, 'line', left + 22, y, width - 44, 1, {
      line: { style: 'solid', fill: '#DBEAFE', width: 1 },
    })
  }
  addShape(slide, 'custom', left + 86, top + 76, 220, 148, {
    fill: '#2563EB20',
    line: { style: 'solid', fill: c.blue, width: 3 },
    customPaths: [
      {
        width: 220,
        height: 148,
        commands: [
          { moveTo: { x: 26, y: 18 } },
          { lineTo: { x: 178, y: 34 } },
          { lineTo: { x: 196, y: 118 } },
          { lineTo: { x: 82, y: 132 } },
          { lineTo: { x: 18, y: 82 } },
          { close: {} },
        ],
      },
    ],
  })
  addShape(slide, 'line', left + 280, top + 260, 190, 100, {
    rotation: -18,
    line: { style: 'solid', fill: c.green, width: 6 },
  })
  addShape(slide, 'ellipse', left + 450, top + 118, 26, 26, { fill: c.red, line: { style: 'solid', fill: 'white', width: 4 } })
  addShape(slide, 'ellipse', left + 530, top + 300, 22, 22, { fill: c.yellow, line: { style: 'solid', fill: 'white', width: 4 } })
  addText(slide, 'адрес → координаты → контур здания', left + 44, top + height - 54, width - 88, 26, {
    size: 17,
    bold: true,
    color: c.ink,
  })
}

function miniTable(slide, rows, left, top, width, rowH = 42) {
  const height = rows.length * rowH
  card(slide, left, top, width, height, { fill: 'white', radius: 8 })
  rows.forEach((row, i) => {
    if (i > 0) addShape(slide, 'line', left, top + i * rowH, width, 1, { line: { style: 'solid', fill: c.line, width: 1 } })
    addText(slide, row[0], left + 18, top + 12 + i * rowH, width * 0.38, 18, {
      size: i === 0 ? 12 : 13,
      bold: i === 0,
      color: i === 0 ? c.muted : c.ink,
    })
    addText(slide, row[1], left + width * 0.42, top + 12 + i * rowH, width * 0.25, 18, {
      size: i === 0 ? 12 : 13,
      bold: i === 0,
      color: i === 0 ? c.muted : c.ink,
    })
    addText(slide, row[2], left + width * 0.68, top + 12 + i * rowH, width * 0.28, 18, {
      size: i === 0 ? 12 : 13,
      bold: i > 0,
      color: i === 0 ? c.muted : (row[2].includes('Ошибка') ? c.red : c.green),
    })
  })
}

function flowNode(slide, title, body, left, top, width, color) {
  const s = card(slide, left, top, width, 112, { fill: 'white', radius: 8 })
  addShape(slide, 'rect', left, top, width, 5, { fill: color, line: { style: 'solid', fill: color, width: 0 } })
  addText(slide, title, left + 18, top + 18, width - 36, 22, { size: 17, bold: true, color: c.black })
  addText(slide, body, left + 18, top + 50, width - 36, 44, { size: 13, color: c.muted })
  return s
}

function addHumanSummaryCard(slide, title, value, rule, left, top, width, color) {
  card(slide, left, top, width, 148, { fill: 'white', shadow: 'shadow-sm' })
  addText(slide, title, left + 22, top + 20, width - 44, 28, { size: 17, bold: true, color: c.black })
  addText(slide, value, left + 22, top + 58, width - 44, 44, { size: 34, bold: true, color })
  addShape(slide, 'ellipse', left + width - 42, top + 24, 20, 20, { fill: c.panel, line: { style: 'solid', fill: c.line, width: 1 } })
  addText(slide, 'i', left + width - 35, top + 25, 7, 14, { size: 12, bold: true, color: c.muted })
  addText(slide, rule, left + 22, top + 112, width - 44, 25, { size: 12, color: c.muted })
}

// 01 Cover
{
  const slide = presentation.slides.add()
  slide.background.fill = 'white'
  addText(slide, 'LOW-CODE GIS PLATFORM', 72, 52, 340, 22, { size: 12, bold: true, color: c.blue })
  addText(slide, 'Муниципальная\nGIS-платформа', 72, 124, 560, 156, { size: 58, bold: true, color: c.black })
  addText(slide, 'Реестры, карта, процессы и контроль исполнения в одной системе для муниципальных работников и контролирующих органов.', 74, 304, 520, 84, { size: 22, color: c.ink })
  addShape(slide, 'roundRect', 72, 436, 610, 58, { fill: c.black, line: { style: 'solid', fill: c.black, width: 0 }, radius: 10 })
  addText(slide, 'Excel → адрес → карта → процесс → контроль → API', 96, 454, 560, 22, { size: 17, bold: true, color: 'white' })
  pill(slide, 'для муниципалитета', 72, 534, 176, c.blue)
  pill(slide, 'для надзора', 268, 534, 130, c.violet)
  pill(slide, 'для региона', 418, 534, 122, c.green)
  mapVisual(slide, 700, 90, 436, 470)
  addShape(slide, 'roundRect', 842, 538, 300, 78, { fill: 'white', line: { style: 'solid', fill: c.line, width: 1 }, radius: 8, shadow: 'shadow-sm' })
  addText(slide, 'Один объект = карточка\n+ геометрия + статус + история', 868, 557, 248, 42, { size: 15, bold: true, color: c.black })
  addFooter(slide, 1)
  addNotes(slide, [
    'Открываем презентацию с простой формулы продукта: существующие таблицы и адреса превращаются в управляемые городские объекты.',
    'Главный акцент: это не отдельная карта и не отдельный реестр, а рабочий контур для исполнения и контроля.',
  ])
}

// 02 Problem
{
  const slide = addSlide('Муниципальная работа распадается на несвязанные контуры', 'ПРОБЛЕМА')
  const items = [
    ['Excel-реестры', 'адреса, сроки, статусы и ответственные живут в разных файлах', c.blue],
    ['Карты отдельно', 'геометрия объекта не связана с карточкой, документами и проверками', c.green],
    ['Документы отдельно', 'акты, фотографии и отчеты трудно привязать к конкретному объекту', c.violet],
    ['Контроль вручную', 'просрочки, нарушения и изменения собираются через звонки и переписки', c.red],
    ['API в конце', 'интеграции появляются поздно и требуют дополнительной разработки', c.yellow],
  ]
  items.forEach((item, i) => {
    const left = 92 + (i % 3) * 360
    const top = i < 3 ? 220 : 410
    const width = i < 3 ? 320 : 500
    card(slide, left, top, width, 128, { fill: 'white', shadow: 'shadow-sm' })
    cardTitle(slide, item[0], item[1], left + 20, top + 24, width - 40, item[2])
  })
  addText(slide, 'Итог: каждый новый процесс запускается как ручная сборка из таблиц, карт, документов и отчетов.', 92, 594, 1032, 34, { size: 22, bold: true, color: c.black })
  addFooter(slide, 2)
  addNotes(slide, [
    'Слайд фиксирует боль покупателя без спорных количественных заявлений: разрозненность реестров, карт, документов, контроля и интеграций.',
    'Это типовой вход в продажу для администрации, департамента или контролирующего органа.',
  ])
}

// 03 Solution
{
  const slide = addSlide('Решение: единый контур от данных до контроля', 'ПРОДУКТ')
  addText(slide, 'Платформа собирает объект, карту, процесс, документы, аудит и API вокруг одной сущности. Новые реестры создаются через настройки, а пользователь работает в готовом интерфейсе.', 76, 208, 430, 132, { size: 23, color: c.ink })
  metricCard(slide, 'Сущность', '1 модель', 'поля, справочники, карта, права', 76, 386, 250, c.blue)
  metricCard(slide, 'Рабочий контур', '5 слоев', 'реестр, карточка, карта, задачи, аудит', 350, 386, 260, c.green)
  const n1 = flowNode(slide, 'Настроить', 'сущность, поля, геометрию, стили, роли', 676, 204, 190, c.blue)
  const n2 = flowNode(slide, 'Загрузить', 'Excel/CSV, сопоставление колонок, проверка строк', 916, 204, 210, c.violet)
  const n3 = flowNode(slide, 'Работать', 'карточки объектов, карта, документы и переходы', 676, 392, 190, c.green)
  const n4 = flowNode(slide, 'Контролировать', 'дашборд, гео-правила, аудит и API', 916, 392, 210, c.red)
  slide.shapes.connect(n1, n2, { kind: 'straight', fromSide: 'right', toSide: 'left', line: { style: 'solid', fill: c.line, width: 2 }, head: { type: 'arrow', width: 'med', length: 'med' } })
  slide.shapes.connect(n1, n3, { kind: 'straight', fromSide: 'bottom', toSide: 'top', line: { style: 'solid', fill: c.line, width: 2 }, head: { type: 'arrow', width: 'med', length: 'med' } })
  slide.shapes.connect(n2, n4, { kind: 'straight', fromSide: 'bottom', toSide: 'top', line: { style: 'solid', fill: c.line, width: 2 }, head: { type: 'arrow', width: 'med', length: 'med' } })
  slide.shapes.connect(n3, n4, { kind: 'straight', fromSide: 'right', toSide: 'left', line: { style: 'solid', fill: c.line, width: 2 }, head: { type: 'arrow', width: 'med', length: 'med' } })
  addFooter(slide, 3)
  addNotes(slide, [
    'Главная продажная мысль: сущность является центром продукта. Из нее строятся реестр, форма, карточка, карта, права и API.',
    'Эта логика отражена в доменной модели EntitySchema и generic widgets.',
  ])
}

// 04 Worker
{
  const slide = addSlide('Для муниципального работника это рабочее место вместо Excel', 'ЦЕННОСТЬ ДЛЯ ИСПОЛНИТЕЛЯ')
  const data = [
    ['Вести реестр', 'создавать объекты, менять поля, искать, фильтровать и видеть статусы'],
    ['Работать с адресом', 'получать подсказки, нормализовать адрес и подставлять координаты'],
    ['Использовать карту', 'видеть объект на карте, редактировать геометрию и выбирать контур дома'],
    ['Закрывать задачи', 'проходить статусы, прикладывать документы и сохранять историю изменений'],
  ]
  data.forEach((item, i) => moduleBox(slide, item[0], item[1], 76 + (i % 2) * 558, 216 + Math.floor(i / 2) * 164, 506, 120, [c.blue, c.green, c.violet, c.red][i]))
  addText(slide, 'Сотрудник не думает о структуре базы и интеграциях: он работает с понятной карточкой объекта и видит, что нужно сделать дальше.', 86, 568, 1030, 42, { size: 22, bold: true, color: c.black })
  addFooter(slide, 4)
  addNotes(slide, [
    'Слайд переводит технические функции в язык пользователя: вместо таблиц и разрозненных действий сотрудник получает единое рабочее место.',
    'Функции подтверждаются страницами runtime: dashboard, map, entity registry, entity create/details, tasks.',
  ])
}

// 05 Supervisors
{
  const slide = addSlide('Для контролирующих органов это прозрачная проверка исполнения', 'ЦЕННОСТЬ ДЛЯ КОНТРОЛЯ')
  card(slide, 76, 214, 488, 328, { fill: c.soft })
  addText(slide, 'Что видно контролеру', 108, 244, 330, 30, { size: 24, bold: true, color: c.black })
  const checks = ['сроки и просрочки', 'статусы и переходы', 'ответственные роли', 'геометрия и территория', 'документы и вложения', 'аудит изменений']
  checks.forEach((item, i) => {
    const y = 296 + i * 36
    addShape(slide, 'ellipse', 112, y + 2, 16, 16, { fill: c.green, line: { style: 'solid', fill: c.green, width: 0 } })
    addText(slide, item, 142, y - 1, 330, 22, { size: 17, color: c.ink })
  })
  card(slide, 642, 214, 488, 328, { fill: 'white', shadow: 'shadow-sm' })
  addText(slide, 'Что меняется в управлении', 674, 244, 380, 30, { size: 24, bold: true, color: c.black })
  addText(slide, 'Проверка становится доказательной: объект на карте связан с карточкой, статусом, документами, правилами и историей. Это снижает зависимость от ручных запросов и разрозненных выгрузок.', 674, 304, 390, 136, { size: 23, color: c.ink })
  addShape(slide, 'roundRect', 674, 468, 236, 42, { fill: '#DCFCE7', line: { style: 'solid', fill: '#BBF7D0', width: 1 }, radius: 8 })
  addText(slide, 'аудит + геометрия + статус', 692, 481, 200, 18, { size: 14, bold: true, color: c.green })
  addFooter(slide, 5)
  addNotes(slide, [
    'Контролирующим органам продаем прозрачность: проверяемые объекты, правила, история изменений и подтверждающие документы находятся в одном контуре.',
    'Доменная модель содержит GeoRule, Workflow, Task, Attachment и AuditEvent.',
  ])
}

// 06 Modules
{
  const slide = addSlide('Ключевые модули платформы', 'ВОЗМОЖНОСТИ')
  const modules = [
    ['Конструктор сущностей', 'поля, типы, обязательность, видимость, карта, права доступа', c.blue],
    ['Справочники', 'значения по сущностям, импорт из Excel, поиск, активность', c.green],
    ['Импорт данных', 'загрузка файла, сопоставление колонок, проверка и отчет по ошибкам', c.violet],
    ['Карта и геометрия', 'OpenLayers, стили, цветовые правила, кластеризация, контур здания', c.blue2],
    ['Процессы и задачи', 'статусы, переходы, роли, проверки обязательных полей и гео-правил', c.red],
    ['API-генератор', 'REST-ручки для сущностей и справочников, фильтры query/body, OpenAPI', c.yellow],
  ]
  modules.forEach((m, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    moduleBox(slide, m[0], m[1], 76 + col * 374, 214 + row * 168, 330, 124, m[2])
  })
  addFooter(slide, 6)
  addNotes(slide, [
    'Это обзорная карта модулей для демонстрации продукта. Слайды дальше раскрывают самые продаваемые сценарии.',
    'Модули соответствуют текущей структуре роутов и виджетов приложения.',
  ])
}

// 07 Import
{
  const slide = addSlide('Импорт превращает существующие таблицы в управляемые объекты', 'СЦЕНАРИЙ')
  const steps = [
    ['Выбор сущности', 'пользователь выбирает, в какой реестр загрузить данные'],
    ['Колонки файла', 'поля из Excel сопоставляются с полями сущности'],
    ['Проверка строк', 'даты, обязательные поля, адреса и ошибки видны до сохранения'],
    ['Создание объектов', 'валидные строки становятся карточками, координатами и геометрией'],
  ]
  steps.forEach((s, i) => step(slide, i + 1, s[0], s[1], 76 + i * 280, 216, 248))
  miniTable(slide, [
    ['Строка', 'Поле', 'Результат'],
    ['12', 'Адрес', 'Добавлено'],
    ['18', 'Дата окончания', 'Ошибка формата'],
    ['24', 'Статус', 'Добавлено'],
  ], 230, 438, 818)
  addText(slide, 'Важное отличие: импорт не просто складывает файл в систему, а сразу готовит данные к работе на карте и в процессе.', 164, 612, 916, 32, { size: 20, bold: true, color: c.black })
  addFooter(slide, 7)
  addNotes(slide, [
    'В сценарии импорта важно подчеркнуть привычную точку входа: у муниципалитета уже есть Excel, и платформа превращает его в управляемые объекты.',
    'Реализация использует страницу импорта, парсинг дат и addressGeometry с DaData/Nominatim.',
  ])
}

// 08 GIS
{
  const slide = addSlide('GIS-модуль связывает адрес, дом, объект и территорию', 'КАРТА')
  mapVisual(slide, 76, 210, 520, 368)
  card(slide, 660, 210, 470, 368, { fill: 'white', shadow: 'shadow-sm' })
  addText(slide, 'Что можно делать на карте', 696, 242, 350, 28, { size: 24, bold: true, color: c.black })
  const rows = [
    ['Определить геометрию по адресу из карточки', c.blue],
    ['Кликнуть по дому и выбрать контур здания', c.green],
    ['Рисовать только разрешенные типы геометрии', c.violet],
    ['Менять цвет по условиям и статусам', c.red],
    ['Включать кластеризацию для точечных объектов', c.yellow],
  ]
  rows.forEach((row, i) => {
    const y = 308 + i * 46
    addShape(slide, 'roundRect', 696, y - 3, 26, 26, { fill: `${row[1]}16`, line: { style: 'solid', fill: `${row[1]}44`, width: 1 }, radius: 6 })
    addShape(slide, 'ellipse', 704, y + 5, 10, 10, { fill: row[1], line: { style: 'solid', fill: row[1], width: 0 } })
    addText(slide, row[0], 738, y - 2, 330, 24, { size: 17, color: c.ink })
  })
  addFooter(slide, 8)
  addNotes(slide, [
    'Карта является продающим ядром продукта: объект не только имеет адрес, но и получает геометрию здания или пользовательскую геометрию.',
    'Слайд опирается на MapCanvas, GeometryEditor, addressGeometry, DaData и Nominatim.',
  ])
}

// 09 Dashboard
{
  const slide = addSlide('Дашборды показывают управленческие сигналы', 'ГЛАВНЫЙ ЭКРАН')
  addText(slide, 'Пользователь сам собирает summary-блоки по сущностям: выбирает поле, метрику, условия, цвет реакции и описание для подсказки.', 76, 206, 520, 80, { size: 22, color: c.ink })
  addHumanSummaryCard(slide, 'Просроченные обращения', '7', 'красный — при наличии просрочки', 72, 340, 332, c.red)
  addHumanSummaryCard(slide, 'Ордера в работе', '42', 'желтый — если срок близок к завершению', 440, 340, 332, c.yellow)
  addHumanSummaryCard(slide, 'Объекты без геометрии', '13', 'синий — требует уточнения на карте', 808, 340, 332, c.blue)
  card(slide, 676, 206, 464, 86, { fill: c.soft })
  addText(slide, 'Пример условия', 704, 226, 160, 20, { size: 13, bold: true, color: c.muted })
  addText(slide, '“показать ордера, созданные сегодня, или ордера со сроком позже текущей даты и статусом в работе”', 704, 252, 394, 26, { size: 16, bold: true, color: c.black })
  addFooter(slide, 9)
  addNotes(slide, [
    'Дашборд продаем как управленческий экран: не просто количество записей, а условия, которые подсвечивают риск и действие.',
    'Функциональность описана в DashboardPage, dashboardFilters и типах DashboardSummaryBlock.',
  ])
}

// 10 Architecture
{
  const slide = addSlide('Архитектура готова к муниципальному и региональному масштабу', 'ТЕХНИЧЕСКАЯ ГОТОВНОСТЬ')
  const left = [
    ['PostgreSQL + PostGIS', 'геометрии, адреса и объекты в промышленной ГИС-базе'],
    ['3НФ модель', 'сущности, поля, значения, справочники, роли и аудит разделены'],
    ['RBAC', 'системные и объектные разрешения по ролям'],
    ['Generated API', 'единый каталог REST-ручек и OpenAPI для интеграций'],
  ]
  left.forEach((item, i) => moduleBox(slide, item[0], item[1], 76, 210 + i * 100, 470, 78, [c.blue, c.green, c.violet, c.yellow][i]))
  card(slide, 650, 218, 474, 320, { fill: c.soft })
  addText(slide, 'Слои данных', 684, 246, 220, 24, { size: 22, bold: true, color: c.black })
  const layers = [
    ['Настройки', 'сущности, поля, карта, справочники'],
    ['Операционные данные', 'объекты, значения, задачи, документы'],
    ['Контроль', 'процессы, гео-правила, аудит, отчеты'],
    ['Интеграции', 'API, OpenAPI, импорт/экспорт'],
  ]
  layers.forEach((l, i) => {
    const y = 298 + i * 50
    addShape(slide, 'rect', 686, y, 390, 1, { line: { style: 'solid', fill: c.line, width: 1 } })
    addText(slide, l[0], 686, y + 14, 170, 18, { size: 15, bold: true, color: c.black })
    addText(slide, l[1], 870, y + 14, 214, 18, { size: 13, color: c.muted })
  })
  addFooter(slide, 10)
  addNotes(slide, [
    'Технический слайд нужен для IT-директора и закупочного комитета: показываем, что продукт можно переводить в промышленный backend без ломки доменной модели.',
    'Основание: README, generatedApi и документ PostgreSQL 3НФ схемы.',
  ])
}

// 11 Commercial
{
  const slide = addSlide('Коммерческая упаковка строится вокруг скорости запуска', 'ПРОДАЖА')
  const packs = [
    ['Пилот', '1 процесс', 'берем реальный Excel, настраиваем сущность, карту и дашборд, показываем результат на данных заказчика', c.blue],
    ['Департамент', 'несколько реестров', 'добавляем роли, справочники, импорт, процессы, документы и отчетность для рабочей группы', c.green],
    ['Город / регион', 'единая модель', 'масштабируем на муниципалитеты, подключаем API, права, аудит и типовые настройки', c.violet],
  ]
  packs.forEach((p, i) => {
    const left = 76 + i * 374
    card(slide, left, 214, 330, 344, { fill: 'white', shadow: 'shadow-sm' })
    addShape(slide, 'rect', left, 214, 330, 7, { fill: p[3], line: { style: 'solid', fill: p[3], width: 0 } })
    addText(slide, p[0], left + 28, 250, 260, 34, { size: 28, bold: true, color: c.black })
    addText(slide, p[1], left + 28, 304, 240, 26, { size: 18, bold: true, color: p[3] })
    addText(slide, p[2], left + 28, 356, 262, 118, { size: 17, color: c.ink })
    addShape(slide, 'roundRect', left + 28, 496, 166, 36, { fill: `${p[3]}14`, line: { style: 'solid', fill: `${p[3]}44`, width: 1 }, radius: 8 })
    addText(slide, i === 0 ? 'быстрый вход' : i === 1 ? 'рабочий масштаб' : 'стандарт региона', left + 44, 507, 130, 16, { size: 12, bold: true, color: p[3] })
  })
  addText(slide, 'Продажа начинается не с “внедрения платформы”, а с понятного процесса, который уже болит: ордера, обращения, благоустройство, проверки, ремонт, нестационарные объекты.', 112, 610, 986, 30, { size: 20, bold: true, color: c.black })
  addFooter(slide, 11)
  addNotes(slide, [
    'Слайд избегает неподтвержденных цен и ROI, но дает понятную коммерческую лестницу: пилот, департамент, город/регион.',
    'Упаковка опирается на модульность продукта и metadata-driven UI.',
  ])
}

// 12 Close
{
  const slide = presentation.slides.add()
  slide.background.fill = c.black
  addText(slide, 'NEXT STEP', 72, 54, 160, 22, { size: 12, bold: true, color: c.blue2 })
  addText(slide, 'Начать можно\nс одного реального\nпроцесса', 72, 126, 590, 194, { size: 54, bold: true, color: 'white' })
  addText(slide, 'Берем Excel заказчика, настраиваем сущность, импортируем адреса, показываем карту, контрольный дашборд и API-каталог.', 76, 350, 520, 90, { size: 23, color: '#CBD5E1' })
  const actions = [
    ['1', 'Выбрать процесс', 'ордер, обращение, проверка, объект благоустройства'],
    ['2', 'Загрузить данные', 'файл, адреса, даты, справочники и ошибки строк'],
    ['3', 'Показать результат', 'карта, карточки, статусы, аудит, API'],
  ]
  actions.forEach((a, i) => {
    const top = 150 + i * 136
    card(slide, 732, top, 392, 96, { fill: '#0F172A', line: '#334155', radius: 8 })
    addShape(slide, 'ellipse', 758, top + 28, 38, 38, { fill: i === 0 ? c.blue : i === 1 ? c.green : c.violet, line: { style: 'solid', fill: 'none', width: 0 } })
    addText(slide, a[0], 771, top + 37, 12, 16, { size: 13, bold: true, color: 'white' })
    addText(slide, a[1], 820, top + 22, 220, 24, { size: 20, bold: true, color: 'white' })
    addText(slide, a[2], 820, top + 54, 250, 20, { size: 13, color: '#94A3B8' })
  })
  addShape(slide, 'roundRect', 72, 520, 270, 58, { fill: c.blue, line: { style: 'solid', fill: c.blue, width: 0 }, radius: 8 })
  addText(slide, 'Пилот на данных\nзаказчика', 96, 535, 222, 34, { size: 16, bold: true, color: 'white' })
  addText(slide, '12', 1164, 668, 44, 20, { size: 11, bold: true, color: '#94A3B8' })
  addNotes(slide, [
    'Завершение переводит презентацию в конкретное действие: не просим купить абстрактную платформу, предлагаем быстрый пилот на реальном процессе.',
    'Финальная формула соответствует текущим модулям продукта: импорт, сущности, карта, dashboard и API.',
  ])
}

await fs.mkdir(path.dirname(OUT), { recursive: true })
const pptx = await PresentationFile.exportPptx(presentation)
await pptx.save(OUT)
console.log(OUT)
