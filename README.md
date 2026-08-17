# LowCode GIS Platform

Production-quality frontend MVP low-code GIS-платформы для автоматизации муниципальных процессов.

Главная гипотеза продукта:

```text
Entity Schema + Workflow + Spatial Rules = готовое рабочее место
```

UI не содержит отдельных `OrdersTable.vue`, `PlaygroundForm.vue` или `ParkingCard.vue`. Реестр, форма, карточка и map layer строятся из `EntitySchema`.

## Stack

- Vue 3 + TypeScript + Vite
- Composition API
- Vue Router
- Pinia
- PrimeVue / PrimeIcons
- Lucide Vue
- OpenLayers
- SQLite-backed runtime repositories

## Run

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run build
```

## GitHub Pages

Проект подготовлен для публикации из репозитория `low-code` через GitHub Actions.

Локальная проверка production-сборки для Pages:

```bash
npm run build:pages
```

Что настроено:

- base path для ассетов: `/low-code/`;
- hash-router, чтобы вложенные страницы открывались на GitHub Pages без серверного роутинга;
- статический режим хранения данных через `localStorage`;
- workflow `.github/workflows/pages.yml`;
- `public/.nojekyll`, чтобы GitHub Pages не обрабатывал `dist` через Jekyll.

В GitHub нужно открыть `Settings -> Pages` и выбрать source `GitHub Actions`.
Не выбирайте `Deploy from a branch`: в этом режиме GitHub Pages опубликует исходный `index.html` из корня проекта, а не собранную папку `dist`, и приложение откроется белым экраном.

Важно: GitHub Pages является статическим хостингом. SQLite и dev API `/api/v1/...` работают в режиме `npm run dev`; на Pages пользовательские данные сохраняются в браузере через `localStorage`.

## Demo Accounts

- `admin / admin`
- `operator / operator`
- `manager / manager`
- `viewer / viewer`

## Core Routes

Runtime:

- `/app/dashboard`
- `/app/map`
- `/app/entities/:entityCode`
- `/app/entities/:entityCode/new`
- `/app/entities/:entityCode/:objectId`
- `/app/tasks`
- `/app/analytics`

Administration:

- `/admin/entities`
- `/admin/entities/new`
- `/admin/entities/:id`
- `/admin/dictionaries`
- `/admin/workflows`
- `/admin/workflows/:id`
- `/admin/geo-rules`
- `/admin/geo-rules/new`
- `/admin/layers`
- `/admin/users`
- `/admin/roles`
- `/admin/organizations`
- `/admin/import`
- `/admin/settings`

## Architecture

The project is domain-oriented:

```text
src/
  app/
    router/
    layouts/
  shared/
    api/
    config/
    lib/
    types/
    ui/
  stores/
  widgets/
    entity/
    map/
    workflow/
    geo/
    audit/
  pages/
```

`src/shared/types/domain.ts` contains the typed domain model:

- `EntitySchema`
- `EntityField`
- `EntityObject`
- `Dictionary`
- `User`
- `Role`
- `Permission`
- `Organization`
- `Workflow`
- `WorkflowState`
- `WorkflowTransition`
- `Task`
- `GeoRule`
- `Layer`
- `Attachment`
- `AuditEvent`

`src/shared/api/repositories.ts` defines the repository/service abstraction. UI components do not talk to storage directly. Replacing local runtime data with backend API should be done by swapping repository implementation internals while keeping store and component contracts stable.

## Metadata-Driven UI

Generic widgets:

- `EntityRegistry`
- `EntityForm`
- `EntityFieldRenderer`
- `EntityCard`
- `EntityPropertyList`
- `StatusBadge`
- `GeometryEditor`
- `MapCanvas`
- `WorkflowActions`
- `GeoValidationResult`
- `AuditTimeline`

Flow:

```text
EntitySchema
  -> EntityRegistry
  -> EntityForm
  -> EntityCard
  -> MapCanvas layer
```

Field rendering:

- `string` -> InputText
- `text` -> Textarea
- `integer` / `decimal` -> InputNumber
- `boolean` -> Checkbox
- `date` / `datetime` -> DatePicker
- `enum` -> Select from Dictionary
- `reference` -> Select
- `file` -> file input

Validation is generated from field metadata: required fields are checked before save and before configured workflow transitions.

## Low-Code Demo: Parkings

1. Login as `admin / admin`.
2. Open `/admin/entities`.
3. Click `Создать сущность`.
4. Use:
   - name: `Парковки`
   - geometry: `Point`
5. In Entity Builder add fields:
   - `Название` / `name` / String
   - `Адрес` / `address` / String
   - `Количество мест` / `capacity` / Integer
   - `Тип` / `type` / Enum
   - `Платная` / `paid` / Boolean
6. For `Тип`, choose dictionary `Типы парковок`.
7. Open `Preview` to see generated registry/form/card.
8. Click `Опубликовать`.
9. Runtime sidebar will include `Парковки`.
10. Login as `operator / operator`, open `Парковки`, create an object and place a point on the map.

The object will appear in:

- generated registry;
- global map;
- object card;
- audit history after edits.

There is no Parking-specific Vue component.

## Workflow

Workflows are stored as metadata:

- states;
- transitions;
- allowed roles;
- required-field validation flag;
- geo-rule validation flag.

`WorkflowActions` reads the active workflow for the current object's entity and shows only transitions allowed for the current user's roles.

For seeded Orders:

```text
draft -> review -> approval -> active -> closed
```

When an object enters `review`, a manager task is created.

## Geo Rules

Geo rules are metadata records:

- source entity;
- operator: `INTERSECTS`, `WITHIN`, `DISTANCE`;
- target entity;
- severity;
- message;
- whether the rule blocks workflow transitions.

Seeded rule:

```text
Orders.geometry INTERSECTS WarrantyAreas.geometry -> ERROR
```

The geometry engine currently uses simple bbox/intersection and distance checks suitable for frontend MVP validation. Production should delegate authoritative topology to backend GIS services such as PostGIS.

## SQLite Repository Layer

The local runtime data layer lives in:

- `src/shared/api/seed.ts`
- `src/shared/api/repositories.ts`
- `dev-server/sqliteDatabase.ts`

Data is stored in SQLite at:

```text
.data/low-code.sqlite
```

Legacy browser `localStorage` data under `low-code-gis-platform-db-v1` is imported into SQLite once when the app first connects to the Vite runtime API.

For GitHub Pages builds, `VITE_STATIC_STORAGE=true` switches repositories back to browser `localStorage`, because static hosting cannot run the Vite SQLite middleware.

Every repository call has a 220-480ms artificial delay to exercise loading states.

To reset demo data, open:

```text
/admin/settings
```

and click `Reset demo data`.

## Replacing Mock Repositories With Backend API

Keep repository method contracts stable and replace implementation internals:

```text
repositories.entitySchemas.list()
repositories.entitySchemas.save()
repositories.entityObjects.create()
repositories.workflows.applyTransition()
repositories.geoRules.validate()
```

Suggested production split:

- `EntitySchemaRepository` -> `/api/entity-schemas`
- `EntityObjectRepository` -> `/api/entities/:entityCode/objects`
- `WorkflowRepository` -> `/api/workflows`
- `GeoRuleRepository` -> `/api/geo-rules`
- `UserRepository` / `RoleRepository` -> identity and RBAC API

UI and Pinia stores should not change if the returned data contracts remain the same.

## Current MVP Scope

Implemented:

- login and role-based UI actions;
- runtime dashboard;
- global OpenLayers map;
- metadata-driven registry/form/card;
- geometry editing for Point, LineString and Polygon;
- geo validation result dialog;
- entity builder with preview;
- dictionaries;
- workflow list and node-based workflow builder;
- geo-rule builder;
- layer administration;
- users, roles, organizations;
- import wizard shell;
- settings;
- attachments and audit timeline;
- local persistence after reload.

Not intended for this frontend MVP:

- production GIS topology;
- backend authentication;
- BI builder;
- full BPMN editor;
- mobile-first layout.
