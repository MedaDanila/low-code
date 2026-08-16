<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { Baby, Check, ClipboardCheck, FilePlus2, School, ToyBrick, Trees } from '@lucide/vue'
import Checkbox from 'primevue/checkbox'
import { useRouter } from 'vue-router'
import UiButton from '../../shared/ui/UiButton.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiPageHeader from '../../shared/ui/UiPageHeader.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import UiTextarea from '../../shared/ui/UiTextarea.vue'
import { usePlatformStore } from '../../stores/platform'
import type { EntityField, EntityMapStyle, EntitySchema, FieldType, MapGeometryType } from '../../shared/types/domain'

type StepId = 'purpose' | 'fields' | 'map' | 'review'
type TemplateId = 'education' | 'playgrounds' | 'kindergartens' | 'orders' | 'public-spaces'
type CreateSourceId = TemplateId | 'scratch'

interface StarterField {
  id: string
  name: string
  type: FieldType
  required: boolean
  listVisible: boolean
  cardVisible: boolean
}

interface EntityTemplate {
  id: TemplateId
  title: string
  description: string
  icon: Component
  exampleName: string
  exampleDescription: string
  geometryTypes: MapGeometryType[]
  clusteringEnabled: boolean
  fields: Array<Omit<StarterField, 'id'>>
}

const router = useRouter()
const platform = usePlatformStore()

const steps: Array<{ id: StepId; title: string; caption: string }> = [
  { id: 'purpose', title: 'Назначение', caption: 'Имя и сценарий' },
  { id: 'fields', title: 'Поля', caption: 'Стартовая структура' },
  { id: 'map', title: 'Карта', caption: 'Геометрии и кластеризация' },
  { id: 'review', title: 'Проверка', caption: 'Финальный черновик' },
]

const templates: EntityTemplate[] = [
  {
    id: 'education',
    title: 'Учебные заведения',
    description: 'Школы, вузы и организации среднего профессионального образования.',
    icon: School,
    exampleName: 'Учебные заведения',
    exampleDescription: 'Реестр школ, вузов и организаций СПО с показателями вместимости.',
    geometryTypes: ['point', 'polygon'],
    clusteringEnabled: true,
    fields: [
      starterField('Наименование', 'string', true),
      starterField('Тип учреждения', 'string', true),
      starterField('Количество учащихся', 'integer'),
      starterField('Проектная мощность', 'integer'),
      starterField('Руководитель', 'string'),
      starterField('Телефон', 'string'),
    ],
  },
  {
    id: 'kindergartens',
    title: 'Детские сады',
    description: 'Дошкольные учреждения, количество мест, группы и контактные данные.',
    icon: Baby,
    exampleName: 'Детские сады',
    exampleDescription: 'Реестр дошкольных учреждений с данными о вместимости и группах.',
    geometryTypes: ['point', 'polygon'],
    clusteringEnabled: true,
    fields: [
      starterField('Наименование', 'string', true),
      starterField('Тип учреждения', 'string'),
      starterField('Количество мест', 'integer'),
      starterField('Количество групп', 'integer'),
      starterField('Руководитель', 'string'),
      starterField('Телефон', 'string'),
    ],
  },
  {
    id: 'playgrounds',
    title: 'Детские площадки',
    description: 'Игровые зоны, оборудование, техническое состояние и балансодержатели.',
    icon: ToyBrick,
    exampleName: 'Детские площадки',
    exampleDescription: 'Паспортизация детских площадок и контроль состояния оборудования.',
    geometryTypes: ['point', 'polygon'],
    clusteringEnabled: true,
    fields: [
      starterField('Наименование', 'string', true),
      starterField('Инвентарный номер', 'string'),
      starterField('Возрастная группа', 'string'),
      starterField('Состояние', 'string', true),
      starterField('Балансодержатель', 'string'),
      starterField('Год установки', 'integer'),
      starterField('Доступная среда', 'boolean', false, false),
    ],
  },
  {
    id: 'orders',
    title: 'Ордера',
    description: 'Разрешения на земляные, строительные и дорожные работы.',
    icon: ClipboardCheck,
    exampleName: 'Ордера на производство работ',
    exampleDescription: 'Учёт разрешений, сроков и исполнителей земляных и дорожных работ.',
    geometryTypes: ['polygon', 'lineString'],
    clusteringEnabled: false,
    fields: [
      starterField('Номер ордера', 'string', true),
      starterField('Вид работ', 'string', true),
      starterField('Заявитель', 'string'),
      starterField('Подрядчик', 'string'),
      starterField('Дата начала', 'date', true),
      starterField('Дата окончания', 'date', true),
      starterField('Описание работ', 'text', false, false),
    ],
  },
  {
    id: 'public-spaces',
    title: 'Общественные пространства',
    description: 'Парки, скверы, площади, набережные и благоустроенные территории.',
    icon: Trees,
    exampleName: 'Общественные пространства',
    exampleDescription: 'Реестр парков, скверов и других благоустроенных городских территорий.',
    geometryTypes: ['polygon', 'point'],
    clusteringEnabled: false,
    fields: [
      starterField('Наименование', 'string', true),
      starterField('Тип пространства', 'string', true),
      starterField('Состояние', 'string'),
      starterField('Площадь', 'decimal'),
      starterField('Балансодержатель', 'string'),
      starterField('Доступная среда', 'boolean', false, false),
      starterField('Описание', 'text', false, false),
    ],
  },
]

const fieldTypes: { label: string; value: FieldType }[] = [
  { label: 'Строка', value: 'string' },
  { label: 'Текст', value: 'text' },
  { label: 'Целое число', value: 'integer' },
  { label: 'Дробное число', value: 'decimal' },
  { label: 'Да/нет', value: 'boolean' },
  { label: 'Дата', value: 'date' },
  { label: 'Дата и время', value: 'datetime' },
]

const geometryOptions: Array<{ label: string; value: MapGeometryType }> = [
  { label: 'Точки', value: 'point' },
  { label: 'Линии', value: 'lineString' },
  { label: 'Полигоны', value: 'polygon' },
]

const defaultGeometryStyles: Record<MapGeometryType, EntityMapStyle> = {
  point: { fill: '#f97316', stroke: '#c2410c', strokeWidth: 2, pointSize: 8, opacity: 0.82 },
  lineString: { fill: '#38bdf8', stroke: '#0284c7', strokeWidth: 3, pointSize: 8, opacity: 0.9 },
  polygon: { fill: '#2563eb', stroke: '#1d4ed8', strokeWidth: 2, pointSize: 8, opacity: 0.74 },
}

const activeStep = ref<StepId>('purpose')
const selectedTemplateId = ref<CreateSourceId>('education')
const entityName = ref('')
const entityDescription = ref('')
const geometryTypes = ref<MapGeometryType[]>([...templates[0].geometryTypes])
const clusteringEnabled = ref(templates[0].clusteringEnabled)
const starterFields = ref<StarterField[]>(cloneTemplateFields(templates[0]))
const validationMessage = ref('')
const creating = ref(false)

const selectedTemplate = computed(() => templates.find((template) => template.id === selectedTemplateId.value) ?? templates[0])
const scratchSelected = computed(() => selectedTemplateId.value === 'scratch')
const namePlaceholder = computed(() => (scratchSelected.value ? 'Например, Муниципальные объекты' : selectedTemplate.value.exampleName))
const descriptionPlaceholder = computed(() => (
  scratchSelected.value
    ? 'Опишите, какие объекты будут храниться в этом разделе.'
    : selectedTemplate.value.exampleDescription
))
const activeStepIndex = computed(() => steps.findIndex((step) => step.id === activeStep.value))
const canCreate = computed(() => Boolean(entityName.value.trim()) && starterFieldsValid.value && geometryTypes.value.length > 0)
const starterFieldsValid = computed(() => starterFields.value.every((field) => field.name.trim()))
const totalFieldsCount = computed(() => starterFields.value.length + 1)
const geometrySummary = computed(() => geometryTypes.value.map(geometryLabel).join(', '))
const fieldsSummary = computed(() => {
  const names = starterFields.value.map((field) => field.name).filter(Boolean)
  return names.length ? `${totalFieldsCount.value} · Адрес, ${names.join(', ')}` : '1 · Адрес'
})

function starterField(
  name: string,
  type: FieldType,
  required = false,
  listVisible = true,
  cardVisible = true,
): Omit<StarterField, 'id'> {
  return { name, type, required, listVisible, cardVisible }
}

function cloneTemplateFields(template: EntityTemplate): StarterField[] {
  return template.fields.map((field, index) => ({ ...field, id: `field_${template.id}_${index}` }))
}

function selectTemplate(template: EntityTemplate): void {
  selectedTemplateId.value = template.id
  if (!entityName.value.trim() || isTemplateExample(entityName.value, 'name')) entityName.value = template.exampleName
  if (!entityDescription.value.trim() || isTemplateExample(entityDescription.value, 'description')) {
    entityDescription.value = template.exampleDescription
  }
  geometryTypes.value = [...template.geometryTypes]
  clusteringEnabled.value = template.clusteringEnabled
  starterFields.value = cloneTemplateFields(template)
  validationMessage.value = ''
}

function selectScratch(): void {
  selectedTemplateId.value = 'scratch'
  if (!entityName.value.trim() || isTemplateExample(entityName.value, 'name')) entityName.value = ''
  if (!entityDescription.value.trim() || isTemplateExample(entityDescription.value, 'description')) entityDescription.value = ''
  geometryTypes.value = ['point']
  clusteringEnabled.value = false
  starterFields.value = []
  validationMessage.value = ''
}

function setStep(stepId: StepId): void {
  const targetIndex = steps.findIndex((step) => step.id === stepId)
  const previousStepsReady = steps.slice(0, targetIndex).every((step) => isStepComplete(step.id))
  if (targetIndex <= activeStepIndex.value || previousStepsReady) {
    activeStep.value = stepId
    validationMessage.value = ''
    return
  }
  validationMessage.value = stepErrorMessage(steps.find((_, index) => index < targetIndex && !isStepComplete(_.id))?.id ?? activeStep.value)
}

function nextStep(): void {
  if (!isStepReady(activeStep.value)) return
  const next = steps[activeStepIndex.value + 1]
  if (next) {
    activeStep.value = next.id
    validationMessage.value = ''
  }
}

function previousStep(): void {
  const previous = steps[activeStepIndex.value - 1]
  if (previous) {
    activeStep.value = previous.id
    validationMessage.value = ''
  }
}

function isStepReady(stepId: StepId): boolean {
  if (!isStepComplete(stepId)) {
    validationMessage.value = stepErrorMessage(stepId)
    return false
  }
  validationMessage.value = ''
  return true
}

function isStepComplete(stepId: StepId): boolean {
  if (stepId === 'purpose') return Boolean(entityName.value.trim())
  if (stepId === 'fields') return starterFieldsValid.value
  if (stepId === 'map') return geometryTypes.value.length > 0
  return canCreate.value
}

function stepErrorMessage(stepId: StepId): string {
  if (stepId === 'purpose') return 'Укажите название сущности.'
  if (stepId === 'fields') return 'Заполните названия всех стартовых полей.'
  if (stepId === 'map') return 'Выберите хотя бы один тип геометрии.'
  return 'Заполните обязательные параметры перед созданием.'
}

function isTemplateExample(value: string, field: 'name' | 'description'): boolean {
  const trimmed = value.trim()
  return templates.some((template) => (field === 'name' ? template.exampleName : template.exampleDescription) === trimmed)
}

function toggleGeometry(type: MapGeometryType, checked: boolean): void {
  const current = new Set(geometryTypes.value)
  if (checked) current.add(type)
  else current.delete(type)
  geometryTypes.value = Array.from(current)
}

function addField(): void {
  starterFields.value.push({
    id: `field_custom_${Date.now()}`,
    name: `Новое поле ${starterFields.value.length + 1}`,
    type: 'string',
    required: false,
    listVisible: true,
    cardVisible: true,
  })
}

function deleteField(fieldId: string): void {
  starterFields.value = starterFields.value.filter((field) => field.id !== fieldId)
}

function updateField<K extends keyof StarterField>(fieldId: string, key: K, value: StarterField[K]): void {
  starterFields.value = starterFields.value.map((field) => (field.id === fieldId ? { ...field, [key]: value } : field))
}

async function createEntity(): Promise<void> {
  if (!canCreate.value) {
    validationMessage.value = 'Заполните обязательные параметры перед созданием.'
    return
  }
  creating.value = true
  try {
    const schema = await platform.createSchema({
      name: entityName.value.trim(),
      description: entityDescription.value.trim(),
      geometryType: geometryTypes.value[0],
    })
    const preparedSchema: EntitySchema = {
      ...schema,
      name: entityName.value.trim(),
      description: entityDescription.value.trim(),
      geometryType: geometryTypes.value[0],
      mapSettings: {
        enabledGeometryTypes: geometryTypes.value,
        clusteringEnabled: clusteringEnabled.value,
        styles: structuredClone(defaultGeometryStyles),
        colorRules: [],
      },
      fields: createSchemaFields(schema),
    }
    const saved = await platform.saveSchema(preparedSchema)
    router.replace(`/admin/entities/${saved.id}`)
  } finally {
    creating.value = false
  }
}

function createSchemaFields(schema: EntitySchema): EntityField[] {
  const addressField = schema.fields.find((field) => field.type === 'address') ?? platform.createEmptyField(1)
  return [
    {
      ...addressField,
      name: 'Адрес',
      type: 'address',
      required: true,
      listVisible: true,
      cardVisible: true,
      searchable: true,
      filterable: true,
      order: 1,
    },
    ...starterFields.value.map((field, index) => ({
      ...platform.createEmptyField(index + 2),
      name: field.name.trim(),
      type: field.type,
      required: field.required,
      listVisible: field.listVisible,
      cardVisible: field.cardVisible,
      searchable: true,
      filterable: true,
      order: index + 2,
    })),
  ]
}

function fieldTypeLabel(type: FieldType): string {
  return fieldTypes.find((field) => field.value === type)?.label ?? type
}

function geometryLabel(type: MapGeometryType): string {
  return geometryOptions.find((option) => option.value === type)?.label ?? type
}
</script>

<template>
  <div>
    <UiPageHeader title="Создать сущность" description="Черновик сущности с полями, картой и базовой структурой.">
      <template #actions>
        <UiButton label="К списку" severity="secondary" variant="outlined" @click="router.push('/admin/entities')" />
      </template>
    </UiPageHeader>

    <section class="entity-create-layout">
      <aside class="create-stepper" aria-label="Этапы создания сущности">
        <button
          v-for="(step, index) in steps"
          :key="step.id"
          type="button"
          class="create-step"
          :class="{ active: activeStep === step.id, done: index < activeStepIndex }"
          @click="setStep(step.id)"
        >
          <span>{{ index + 1 }}</span>
          <strong>{{ step.title }}</strong>
          <small>{{ step.caption }}</small>
        </button>
      </aside>

      <main class="panel create-main">
        <section v-if="activeStep === 'purpose'" class="create-section">
          <div class="section-heading">
            <h3>С чего начать</h3>
            <p>Возьмите готовую структуру для типового городского реестра или соберите раздел самостоятельно.</p>
          </div>

          <button
            type="button"
            class="template-card template-card--scratch"
            :class="{ active: scratchSelected }"
            @click="selectScratch"
          >
            <span class="template-card__top">
              <span class="template-card__icon" aria-hidden="true">
                <FilePlus2 :size="20" />
              </span>
              <span v-if="scratchSelected" class="template-card__selected">
                <Check :size="15" />
                Выбрано
              </span>
            </span>
            <span class="template-card__content">
              <strong>Собрать самостоятельно</strong>
              <span>Чистый раздел: по умолчанию присутствует адрес, а остальные поля вы добавите сами.</span>
            </span>
            <span class="template-card__meta">
              <span>Точка по умолчанию</span>
              <span>1 поле</span>
            </span>
          </button>

          <div class="template-grid">
            <button
              v-for="template in templates"
              :key="template.id"
              type="button"
              class="template-card"
              :class="{ active: selectedTemplateId === template.id }"
              @click="selectTemplate(template)"
            >
              <span class="template-card__top">
                <span class="template-card__icon" aria-hidden="true">
                  <component :is="template.icon" :size="20" />
                </span>
                <span v-if="selectedTemplateId === template.id" class="template-card__selected">
                  <Check :size="15" />
                  Выбрано
                </span>
              </span>
              <span class="template-card__content">
                <strong>{{ template.title }}</strong>
                <span>{{ template.description }}</span>
              </span>
              <span class="template-card__meta">
                <span>{{ template.geometryTypes.map(geometryLabel).join(' · ') }}</span>
                <span>{{ template.fields.length + 1 }} полей</span>
              </span>
            </button>
          </div>

          <div class="form-grid create-form-grid">
            <div class="form-field">
              <label>Название</label>
              <UiInput v-model="entityName" :placeholder="namePlaceholder" />
            </div>
            <div class="form-field full">
              <label>Описание</label>
              <UiTextarea v-model="entityDescription" :placeholder="descriptionPlaceholder" :rows="3" />
            </div>
          </div>
        </section>

        <section v-else-if="activeStep === 'fields'" class="create-section">
          <div class="section-heading">
            <div>
              <h3>Стартовые поля</h3>
              <p>Поля задают структуру реестра. Их можно редактировать и дополнять.</p>
            </div>
          </div>

          <div class="system-field-strip" aria-label="Системное поле">
            <strong>Адрес</strong>
            <span>Обязательное системное поле</span>
            <small>В списке · в карточке · в поиске</small>
          </div>

          <div class="field-list">
            <article v-for="field in starterFields" :key="field.id" class="field-item">
              <div class="field-item__controls">
                <div class="form-field">
                  <label>Название</label>
                  <UiInput :model-value="field.name" @update:model-value="updateField(field.id, 'name', String($event))" />
                </div>
                <div class="form-field">
                  <label>Тип</label>
                  <UiSelect
                    :model-value="field.type"
                    :options="fieldTypes"
                    @update:model-value="updateField(field.id, 'type', $event as FieldType)"
                  />
                </div>
              </div>
              <div class="field-item__settings">
                <label><Checkbox :model-value="field.required" binary @update:model-value="updateField(field.id, 'required', Boolean($event))" /> Обязательное</label>
                <label><Checkbox :model-value="field.listVisible" binary @update:model-value="updateField(field.id, 'listVisible', Boolean($event))" /> В списке</label>
                <label><Checkbox :model-value="field.cardVisible" binary @update:model-value="updateField(field.id, 'cardVisible', Boolean($event))" /> В карточке</label>
              </div>
              <UiButton label="Удалить" severity="danger" variant="outlined" @click="deleteField(field.id)" />
            </article>
            <button type="button" class="field-list__add" @click="addField">
              <span class="field-list__add-icon">+</span>
              <span>
                <strong>Добавить поле</strong>
                <small>Новое поле появится в конце структуры</small>
              </span>
            </button>
          </div>
        </section>

        <section v-else-if="activeStep === 'map'" class="create-section">
          <div class="section-heading">
            <h3>Карта</h3>
            <p>Типы геометрий объектов этой сущности.</p>
          </div>

          <div class="geometry-grid">
            <label v-for="option in geometryOptions" :key="option.value" class="geometry-card" :class="{ active: geometryTypes.includes(option.value) }">
              <Checkbox
                :model-value="geometryTypes.includes(option.value)"
                binary
                @update:model-value="toggleGeometry(option.value, Boolean($event))"
              />
              <span>{{ option.label }}</span>
            </label>
          </div>

          <label class="cluster-toggle">
            <Checkbox v-model="clusteringEnabled" binary />
            <span>Кластеризация для плотных наборов объектов</span>
          </label>
        </section>

        <section v-else class="create-section">
          <div class="section-heading">
            <h3>Черновик сущности</h3>
            <p>Сводка параметров перед созданием.</p>
          </div>

          <dl class="review-list">
            <div>
              <dt>Название</dt>
              <dd>{{ entityName || 'Без названия' }}</dd>
            </div>
            <div>
              <dt>Описание</dt>
              <dd>{{ entityDescription || 'Не указано' }}</dd>
            </div>
            <div>
              <dt>Поля</dt>
              <dd>{{ fieldsSummary }}</dd>
            </div>
            <div>
              <dt>Геометрии</dt>
              <dd>{{ geometrySummary || 'Не выбраны' }}</dd>
            </div>
            <div>
              <dt>Кластеризация</dt>
              <dd>{{ clusteringEnabled ? 'Включена' : 'Выключена' }}</dd>
            </div>
          </dl>
        </section>

        <p v-if="validationMessage" class="create-error">{{ validationMessage }}</p>

        <div class="create-actions">
          <UiButton
            label="Назад"
            severity="secondary"
            variant="outlined"
            :disabled="activeStepIndex === 0 || creating"
            @click="previousStep"
          />
          <UiButton
            v-if="activeStep !== 'review'"
            label="Далее"
            icon="pi pi-arrow-right"
            @click="nextStep"
          />
          <UiButton
            v-else
            label="Создать черновик"
            icon="pi pi-check"
            :loading="creating"
            @click="createEntity"
          />
        </div>
      </main>

      <aside class="create-summary">
        <h3>Итог</h3>
        <div class="summary-row">
          <span>Сущность</span>
          <strong>{{ entityName || namePlaceholder }}</strong>
        </div>
        <div class="summary-row">
          <span>Поля</span>
          <strong>{{ totalFieldsCount }}</strong>
        </div>
        <div class="summary-row">
          <span>Карта</span>
          <strong>{{ geometrySummary || 'Не выбрана' }}</strong>
        </div>
        <div class="summary-fields">
          <span>Структура</span>
          <ul>
            <li>Адрес · обязательное поле</li>
            <li v-for="field in starterFields" :key="field.id">{{ field.name }} · {{ fieldTypeLabel(field.type) }}</li>
          </ul>
        </div>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.entity-create-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 300px;
  gap: 18px;
  align-items: start;
}

.create-stepper,
.create-summary {
  position: sticky;
  top: 18px;
}

.create-stepper {
  display: grid;
  gap: 8px;
}

.create-step {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 2px 10px;
  align-items: center;
  min-height: 58px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.create-step span {
  grid-row: span 2;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
  font-weight: 750;
}

.create-step small {
  color: var(--color-text-secondary);
}

.create-step.active {
  border-color: #93c5fd;
  background: rgba(37, 99, 235, 0.08);
}

.create-step.active span,
.create-step.done span {
  background: var(--color-accent);
  color: #fff;
}

.create-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 560px;
}

.create-section {
  display: grid;
  gap: 18px;
}

.section-heading {
  display: grid;
  gap: 4px;
}

.section-heading--inline {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.section-heading h3,
.create-summary h3 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0;
}

.section-heading p {
  margin: 0;
  color: var(--color-text-secondary);
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.template-card:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}

.template-card,
.geometry-card,
.field-item,
.create-summary {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.template-card {
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 12px;
  width: 100%;
  min-height: 168px;
  padding: 16px;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
}

.template-card--scratch {
  min-height: 132px;
}

.template-card:hover {
  border-color: #bfdbfe;
  background: var(--color-surface-muted);
}

.template-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.template-card__top,
.template-card__meta,
.template-card__selected {
  display: flex;
  align-items: center;
}

.template-card__top {
  justify-content: space-between;
  gap: 12px;
}

.template-card__icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
}

.template-card__selected {
  gap: 5px;
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 700;
}

.template-card__content {
  display: grid;
  align-content: start;
  gap: 5px;
}

.template-card__content strong {
  font-size: 15px;
  line-height: 1.3;
}

.template-card__content > span {
  color: var(--color-text-secondary);
  line-height: 1.45;
}

.template-card__meta {
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 650;
}

.template-card.active,
.geometry-card.active {
  border-color: #93c5fd;
  background: rgba(37, 99, 235, 0.08);
}

.template-card.active .template-card__icon {
  background: var(--color-accent);
  color: #fff;
}

.create-form-grid {
  grid-template-columns: minmax(0, 1fr);
}

.field-list {
  display: grid;
  gap: 10px;
}

.field-list__add {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-height: 68px;
  padding: 12px 14px;
  border: 1px dashed #bfdbfe;
  border-radius: var(--radius-md);
  background: rgba(37, 99, 235, 0.04);
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.field-list__add:hover,
.field-list__add:focus-visible {
  border-color: #60a5fa;
  background: rgba(37, 99, 235, 0.08);
  outline: none;
}

.field-list__add-icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}

.field-list__add span:last-child {
  display: grid;
  gap: 3px;
}

.field-list__add small {
  color: var(--color-text-secondary);
}

.system-field-strip {
  display: grid;
  grid-template-columns: minmax(120px, auto) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px dashed #bfdbfe;
  border-radius: var(--radius-md);
  background: rgba(37, 99, 235, 0.05);
}

.system-field-strip strong {
  color: var(--color-text);
}

.system-field-strip span,
.system-field-strip small {
  color: var(--color-text-secondary);
}

.system-field-strip small {
  justify-self: end;
  font-weight: 650;
}

.field-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
  padding: 12px;
}

.field-item__controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 12px;
}

.field-item__settings {
  grid-column: 1 / -1;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  color: var(--color-text-secondary);
}

.field-item__settings label,
.geometry-card,
.cluster-toggle {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.geometry-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.geometry-card {
  min-height: 74px;
  padding: 14px;
  cursor: pointer;
}

.cluster-toggle {
  justify-self: start;
  color: var(--color-text-secondary);
}

.review-list {
  display: grid;
  gap: 10px;
  margin: 0;
}

.review-list div,
.summary-row {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
}

.review-list dt,
.summary-row span,
.summary-fields span {
  color: var(--color-text-secondary);
}

.review-list dd {
  margin: 0;
  font-weight: 650;
}

.create-error {
  margin: 0;
  color: var(--color-danger);
  font-weight: 650;
}

.create-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.create-summary {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.summary-row {
  grid-template-columns: 86px minmax(0, 1fr);
}

.summary-row strong {
  text-align: right;
}

.summary-fields {
  display: grid;
  gap: 8px;
}

.summary-fields ul {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 18px;
}

@media (max-width: 1180px) {
  .entity-create-layout {
    grid-template-columns: 1fr;
  }

  .create-stepper,
  .create-summary {
    position: static;
  }

  .create-stepper {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .create-stepper,
  .template-grid,
  .geometry-grid,
  .system-field-strip,
  .field-item,
  .field-item__controls,
  .section-heading--inline {
    grid-template-columns: 1fr;
  }

  .system-field-strip small {
    justify-self: start;
  }

  .template-card:last-child:nth-child(odd) {
    grid-column: auto;
  }

  .review-list div,
  .summary-row {
    grid-template-columns: 1fr;
  }

  .summary-row strong {
    text-align: left;
  }
}
</style>
