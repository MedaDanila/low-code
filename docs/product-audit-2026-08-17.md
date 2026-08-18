# Product Audit: LowCode GIS Platform

Дата: 2026-08-17  
Роль аудита: Senior Product Manager, Product Analyst, UX Researcher, Solution Architect  
Объект: репозиторий `/Users/danilameda/Documents/ChatGPT/low code`

## 0. Как читать этот документ

Я разделяю четыре уровня уверенности:

- **Факт из кода/данных**: подтверждено файлами, роутами, типами, текущим SQLite-снапшотом или сборкой.
- **Вывод**: интерпретация фактов как продукта.
- **Гипотеза**: правдоподобное предположение, которое нужно проверять с пользователями/покупателями.
- **Неизвестно**: нельзя установить из репозитория без интервью, аналитики, бизнеса или продакшн-контекста.

Ключевые проверки:

- `npm run typecheck` - успешно.
- `npm run build` - успешно.
- `npm run build:pages` - успешно.
- Во время сборки Node выводит предупреждение: SQLite API является experimental. Это не блокирует сборку, но важно для product/enterprise-readiness.

## 1. Executive Summary

### Что это за продукт

**Факт из кода.** README формулирует гипотезу как: `Entity Schema + Workflow + Spatial Rules = готовое рабочее место для отраслевого специалиста`. Стек: Vue 3, TypeScript, Vite, Pinia, OpenLayers, PrimeVue, SQLite-backed runtime repository. Система строится вокруг метаданных: `EntitySchema`, `EntityField`, `EntityObject`, `Dictionary`, `Workflow`, `GeoRule`, `Layer`, `AuditEvent`.

**Вывод.** Это low-code GIS-платформа для муниципальных/городских реестров: администратор описывает сущность и поля, импортирует Excel/CSV, геокодирует адреса, получает таблицу, карточку, форму, слой на карте, дашборд, аудит и базовый API.

### Насколько продукт готов

**Для controlled demo/prototype:** да, готов показывать.  
**Для первого discovery-пилота:** частично, после чистки данных и навигации.  
**Для production/SaaS/enterprise продажи:** пока нет.

Главная причина: в коде уже есть сильный каркас конфигурируемой GIS-платформы, но продуктовая поверхность не совпадает с обещанием. Workflow, geo rules и layers существуют как модели/страницы/виджеты, но ключевые маршруты и действия не подключены к пользовательскому пути. Аналитика завязана на устаревшую сущность `orders`, а текущие runtime-данные описывают школы. Безопасность, multi-tenancy, backend, SSO, API auth, backup, production storage и SLA отсутствуют или находятся только в целевой документации.

### Самые сильные стороны

- Быстрый путь от схемы сущности до реестра, формы, карточки и карты.
- Сильный импортный сценарий: загрузка, маппинг колонок, валидация, геокодинг, массовое создание объектов.
- Универсальные registry/card/form компоненты, которые реально читают метаданные.
- OpenLayers-карта, редактирование геометрии, цветовые правила, слои.
- Документы, фото, PDF/ZIP-отчёты и аудит объектов.
- Хорошая продуктовая основа для "Excel -> нормальный муниципальный GIS-реестр".

### Критические проблемы

1. **Несовпадение обещания и доступного продукта.** README и код обещают workflows, geo rules, layers, tasks и analytics, но часть этих функций скрыта или не работает в основном flow.
2. **Грязные текущие данные.** В текущем SQLite есть сущность `Школы`, 180 объектов, но 179 из них в `draft` и без геометрии. Есть неприемлемое тестовое поле с ненормативным названием. Это нельзя показывать клиенту.
3. **Демо-аккаунты не совпадают с данными.** Login и README показывают `admin/operator/manager/viewer`, но seed и текущая база содержат только `admin`.
4. **Workflow как core differentiator не встроен.** `WorkflowActions` есть, но не используется в карточке объекта. Tasks есть в роутере, но не в sidebar, а роли manager/operator отсутствуют в seed.
5. **Analytics hard-coded.** Страница аналитики считает `orders`, хотя текущая живая сущность - `Школы`. Это создает ложную пустую аналитику.
6. **Enterprise readiness низкая.** Пароли в модели, client-side RBAC, hardcoded DaData token, нет настоящего backend auth/API keys/tenants/audit policy/backups.
7. **API catalog шире фактического API.** Каталог описывает CRUD, HTTP handler поддерживает в основном read/search/get.

### Самая полезная продуктовая формулировка сейчас

**Low-code GIS-реестры для муниципалитетов: из Excel и адресов в управляемый городской реестр с картой, аудитом, импортом, отчётами и настраиваемыми карточками без разработки.**

Не стоит пока позиционировать продукт как полноценный workflow/BPM/enterprise platform, пока workflow, tasks, geo rules, API и безопасность не доведены.

## 2. Product Picture

### Факты из кода

- В `README.md` описаны три демо-сценария: создать справочник, настроить workflow, добавить spatial rule.
- Runtime routes есть для dashboard, map, entity registry/create/details, tasks, analytics.
- Admin routes есть для entities, dictionaries, users, roles, organizations, import, API, settings.
- Страницы для workflows, geo rules и layers существуют в `src/pages/admin`, но не зарегистрированы в router/sidebar.
- Core domain описан в `src/shared/types/domain.ts`: сущности, поля, объекты, словари, роли, организации, workflows, tasks, geo rules, layers, attachments, audit, dashboard settings.
- Persistence слой в `src/shared/api/repositories.ts` работает с AppDatabase, localStorage/static mode/dev SQLite endpoint, выполняет миграции, нормализацию, автосоздание layers/workflows.
- Static mode для GitHub Pages/localStorage включается через `VITE_STATIC_STORAGE=true`.

### Вывод

Продукт фактически состоит из трех слоёв:

1. **Admin/configuration layer**: создание схем, словарей, ролей, организаций, импорт, API/settings.
2. **Runtime workplace layer**: реестр, форма, карточка, карта, документы, история, dashboard.
3. **Demo/dev persistence layer**: JSON-like AppDatabase, localStorage/static snapshot, SQLite JSON tables для разработки.

Архитектурно это ближе к **metadata-driven application builder**, чем к hard-coded отраслевой системе. Но current UX больше похож на "муниципальный реестр с картой", потому что пользователь видит объекты, карту, импорт и карточки, а не платформенную абстракцию.

### Продуктовая напряжённость

Есть конфликт позиционирования:

- **Платформа-конструктор**: schema builder, fields, dictionaries, API, dashboard config.
- **Готовое отраслевое решение**: школы/заказы/карта/муниципалитет/районы/отчёты.

Для продажи и пилота нужно выбрать первичную историю. Самая доказанная по коду история: **конструктор муниципальных GIS-реестров**, а не BPM/workflow suite.

## 3. Current Runtime Data

Текущий SQLite-снапшот `.data/low-code.sqlite` показывает не чистый starter state, а уже настроенную пилотную базу.

### Факты из данных

Таблицы:

- `attachments`
- `audit_events`
- `dictionaries`
- `entity_objects`
- `entity_schemas`
- `geo_rules`
- `layers`
- `organizations`
- `platform_settings`
- `roles`
- `tasks`
- `users`
- `workflows`
- `user_settings`

Количество записей:

| Collection | Count |
|---|---:|
| `entity_schemas` | 1 |
| `entity_objects` | 180 |
| `dictionaries` | 1 |
| `users` | 1 |
| `roles` | 1 |
| `organizations` | 1 |
| `workflows` | 1 |
| `layers` | 1 |
| `geo_rules` | 0 |
| `tasks` | 0 |
| `attachments` | 0 |
| `audit_events` | 216 |
| `user_settings` | 1 |

Активная схема:

- Name: `Школы`
- Code: `shkoly`
- Geometry type: `point`
- Status: `active`

Настройки:

- Platform name: `Муниципальная платформа`
- Municipality: `Нижний Новгород`
- Map zoom: `12`

Пользователи/роли:

- Единственный пользователь: `admin`
- Единственная роль: `admin`

Статусы объектов:

| Status | Count |
|---|---:|
| `draft` | 179 |
| `published` | 1 |

Геометрия:

| Geometry | Count |
|---|---:|
| `Point` | 1 |
| `no_geometry` | 179 |

Audit events:

| Event title | Count |
|---|---:|
| `Создан объект импортом` | 180 |
| `Массовое редактирование объекта` | 33 |
| `Изменены атрибуты объекта` | 2 |
| `Статус: Черновик -> Активен` | 1 |

### Product insight

**Вывод.** Продукт уже использовался для сценария "импорт школ Нижнего Новгорода", но результат импортного сценария не доведён до полезного GIS-состояния: почти все объекты без геометрии и в черновике. Для муниципального продукта это не просто data quality issue, а демонстрация ключевой боли: Excel-реестр трудно превратить в качественный GIS-реестр.

Это можно повернуть в пользу продукта, если добавить **data quality remediation queue**: после импорта пользователь видит, какие строки не прошли геокодинг/валидацию, исправляет адрес/геометрию/поля и постепенно публикует объекты.

### Критическая проблема данных

В текущей схеме `Школы` есть неприемлемое тестовое поле с ненормативным названием. Это необходимо удалить из базы, seed, демо-материалов и любых скриншотов перед внешним показом.

## 4. Users, ICP, Personas

### Подтвержденные пользователи из кода

В доменной модели и UI присутствуют:

- `User`
- `Role`
- `Organization`
- `Permission`
- entity-level permissions
- system-level permissions

Login/README упоминают роли:

- admin
- operator
- manager
- viewer

Однако текущие seed/runtime данные содержат только admin.

### Основные персоны

#### 1. Администратор/конфигуратор

Цель: быстро создать новый реестр без разработки.  
Работает с: entities, builder, dictionaries, import, roles, organizations, dashboard settings, API.

Ключевой JTBD: "Когда департаменту нужен новый реестр городских объектов, я хочу описать поля, карту, справочники и права так, чтобы пользователи могли начать работать без отдельной разработки."

#### 2. Оператор реестра

Цель: вести данные, импортировать таблицы, исправлять адреса, обновлять карточки.  
Работает с: registry, form, card, map editor, bulk edit, export.

Ключевой JTBD: "Когда у меня есть список объектов в Excel, я хочу загрузить его, сопоставить колонки, исправить ошибки и получить рабочий реестр с картой."

#### 3. Руководитель/менеджер

Цель: видеть состояние реестра, просрочки, качество заполнения, отчёты, историю.  
Работает с: dashboard, analytics, tasks, audit, reports.

Сейчас эта персона поддержана слабее всего: dashboard пустой по умолчанию, analytics hard-coded, tasks скрыты.

#### 4. Технический интегратор

Цель: получить API/OpenAPI, выгрузки, импорт/экспорт, интеграции с внешними системами.  
Работает с: Admin API page, generated API, CSV/PDF/ZIP, потенциально backend.

Сейчас API скорее demo/read-only, а не integration-grade.

#### 5. Покупатель

Вероятные роли:

- руководитель цифровизации муниципалитета;
- CIO/ИТ-директор администрации;
- руководитель профильного департамента;
- региональный оператор цифровой платформы;
- подрядчик, внедряющий городские информационные системы.

### ICP-гипотеза

**Лучший ICP сейчас:** средний муниципалитет или региональный оператор, у которого много Excel/CSV-реестров городских объектов, есть адресные данные, слабая GIS-дисциплина и нет бюджета/времени на custom development под каждый реестр.

Сильные признаки ICP:

- 5+ реестров объектов или процессов;
- данные живут в Excel/1C/почте;
- нужны карта, адреса, районы, фото/документы;
- отчёты регулярно собираются вручную;
- есть ответственность за актуальность и аудит изменений;
- хотят пилот за недели, а не разработку за месяцы.

## 5. Problems and JTBD

### Core problem

Муниципальные и отраслевые команды ведут реестры объектов и процессов в Excel, почте, 1C, отдельных GIS-слоях и документах. Данные плохо геокодированы, сложно контролировать качество, нет единой карточки объекта, истории изменений, map view и быстрых отчётов.

### Jobs-to-be-done

| JTBD | Пользователь | Текущая поддержка | Комментарий |
|---|---|---|---|
| Создать новый реестр без разработки | Admin | Сильная | Entity wizard + builder + publish |
| Импортировать Excel/CSV и сопоставить поля | Admin/Operator | Сильная MVP | Import wizard, validation, geocoding |
| Исправлять много объектов быстро | Operator | Сильная | Bulk/spreadsheet mode |
| Видеть объекты на карте | Operator/Manager | Средняя | Map работает, но качество геометрии критично |
| Понять, почему объект не опубликован | Operator | Средняя | Есть validation/status, но нет отдельной очереди качества |
| Настроить справочники | Admin | Сильная | Dictionary pages/import |
| Управлять жизненным циклом объекта | Manager/Operator | Слабая/скрытая | Workflow model exists, actions не встроены |
| Получить управленческий dashboard | Manager | Средняя | Dashboard configurable, но пустой по умолчанию |
| Получить аналитику по реестру | Manager | Слабая | Analytics hard-coded на `orders` |
| Получить отчёт/архив документов | Operator/Manager | Средняя/сильная MVP | PDF/ZIP in object card |
| Интегрировать с внешней системой | Integrator | Слабая | Generated API частичный, auth отсутствует |

### Самый доказанный value

**Excel/CSV с адресами -> валидированный муниципальный реестр -> карта -> карточки -> отчёты.**

Это должно стать главным demo flow.

## 6. Feature Map

### Implemented or mostly implemented

| Feature | Evidence | Product status |
|---|---|---|
| Login/demo auth | `src/pages/login/LoginPage.vue`, `src/stores/auth.ts` | Demo only |
| Entity templates/wizard | `src/pages/admin/AdminEntityCreatePage.vue` | Useful MVP |
| Entity builder | `src/pages/admin/AdminEntityBuilderPage.vue` | Useful but some config gaps |
| Generic registry | `src/widgets/entity/EntityRegistry.vue` | Strong MVP |
| Generic form | `src/widgets/entity/EntityForm.vue`, `EntityFieldRenderer.vue` | Strong MVP |
| Object card | `src/widgets/entity/EntityCard.vue` | Strong MVP |
| Map canvas | `src/widgets/map/MapCanvas.vue` | Strong MVP |
| Geometry editor | `src/widgets/map/GeometryEditor.vue` | Partial, depends on external geocoding |
| Import wizard | `src/pages/admin/AdminImportPage.vue` | Strong MVP |
| Dictionary management/import | `src/pages/admin/AdminDictionariesPage.vue`, `src/shared/lib/dictionaryImport.ts` | Useful MVP |
| Dashboard builder/runtime | `src/pages/settings/HomeSettingsPage.vue`, `src/pages/dashboard/DashboardPage.vue` | MVP, needs defaults |
| Audit timeline | `src/widgets/audit/AuditTimeline.vue`, repository audit events | Useful MVP |
| Attachments/photos/docs | `EntityCard.vue`, repositories | MVP, local storage limits |
| PDF/ZIP reports | `EntityCard.vue` | Useful demo feature |
| Roles/users/orgs | admin pages + domain types | Partial, demo security only |
| Generated API catalog | `src/shared/lib/generatedApi.ts`, API page | Demo/incomplete |

### Present but hidden, stale, or not wired into main flow

| Feature | Evidence | Gap |
|---|---|---|
| Workflows | `WorkflowBuilder.vue`, `WorkflowActions.vue`, repository workflow methods | Pages/actions not wired into main UX |
| Tasks | `TasksPage.vue`, `Task` model | Route exists, sidebar missing, tasks rarely created |
| Geo rules | `GeoRuleBuilder.vue`, admin geo pages, repository validate | Admin routes/sidebar missing, no active rules |
| Layers admin | `AdminLayersPage.vue`, `Layer` model | Admin route/sidebar missing |
| Analytics | `AnalyticsPage.vue` | Hard-coded to `orders`, not generic |
| API CRUD | `generatedApi.ts` catalog | HTTP handler supports mostly list/search/get |

### Missing for product/enterprise

- Tenant/municipality isolation in runtime.
- Production backend with relational integrity and PostGIS.
- Secure auth, password hashing, SSO/LDAP/OIDC.
- API keys/OAuth, rate limits, scoped API permissions.
- Backup/restore, audit retention, export of full tenant data.
- Import batch history and row-level remediation.
- Notifications, comments, mentions, approval inbox.
- Schema versioning and migrations for existing objects.
- Field-level permissions and validation formulas.
- Webhooks/integration jobs.
- Real product telemetry.

## 7. User Flows

### Flow 1: Admin creates a new entity

1. Login as admin.
2. Open admin entities.
3. Choose template or custom entity.
4. Configure purpose, fields, map, review.
5. Create draft schema.
6. Continue in entity builder.
7. Publish.
8. System auto-creates default layer/workflow/permissions where available.
9. Entity appears in runtime sidebar as a registry.

**Evidence:** `AdminEntityCreatePage.vue`, `AdminEntityBuilderPage.vue`, `repositories.ts`.

**Friction:** field wizard does not initially expose all field types; builder later supports more types. Search/filter flags are normalized as always true, so part of schema configurability is not actually user-controlled.

### Flow 2: Admin imports objects

1. Open Import.
2. Select target entity.
3. Upload CSV/XLSX.
4. Map columns to entity fields.
5. Validate rows.
6. Geocode addresses where possible.
7. Import rows as objects.
8. Objects receive draft/published status based on validation.
9. Audit events are created.

**Evidence:** `AdminImportPage.vue`, `dictionaryImport.ts`, `entityObjectValidation.ts`, current audit counts.

**Friction:** no persistent import batch, no row-level remediation queue, no post-import "fix these 179 drafts" workflow.

### Flow 3: Operator works with registry

1. Open runtime entity from sidebar.
2. Search/filter/status filter.
3. Use table/cards/spreadsheet mode.
4. Open object card.
5. Edit fields/map/documents.
6. Save object.
7. See audit/history.
8. Export CSV or PDF/ZIP report.

**Evidence:** `EntityRegistry.vue`, `EntityForm.vue`, `EntityCard.vue`.

**Friction:** destructive delete uses native confirm; validation exists but not always surfaced as a guided "quality" flow.

### Flow 4: Manager uses dashboard

1. Admin configures homepage widgets in settings.
2. Runtime dashboard reads user settings and schema objects.
3. Manager sees metric/chart blocks.

**Evidence:** `DashboardPage.vue`, `HomeSettingsPage.vue`.

**Friction:** current user settings have no summary blocks, so dashboard is empty by default. There is no default dashboard generated after import/template publish.

### Flow 5: User opens map

1. Open global map.
2. Toggle layers/filter entities.
3. See published objects with geometry.
4. Click feature.
5. Open card.

**Evidence:** `GlobalMapPage.vue`, `MapCanvas.vue`, `Layer` model.

**Friction:** current data has only 1 object with geometry, so map value is almost invisible in the current pilot.

### Flow 6: Workflow/tasks intended flow

Intended:

1. Admin configures workflow.
2. Operator opens object card.
3. Operator applies transition.
4. System validates required fields and geo rules.
5. System creates/reassigns tasks.
6. Manager sees tasks.

Actual:

- Workflow data model and UI components exist.
- `WorkflowActions` is not used in object card.
- Tasks route exists but sidebar does not expose it.
- Current seed has no operator/manager roles.

**Conclusion:** workflow is not yet a reliable product promise.

## 8. UX Audit

### UX strengths

- UI is mostly domain-oriented: реестры, карта, карточка, документы, история.
- Entity builder has previews, which helps admins understand changes.
- Import wizard follows a familiar step-by-step mental model.
- Registry has search, filters, table/card/spreadsheet modes.
- Empty states exist in many places.
- Map and card flows are integrated enough for demo.

### UX issues by severity

| Severity | Issue | Evidence | Product impact |
|---|---|---|---|
| Critical | Workflow promise is not discoverable/actionable | Workflow pages/actions exist but not routed/used | Core README formula breaks |
| Critical | Demo data contains inappropriate field | Current SQLite schema | Cannot show externally |
| High | Login advertises accounts that do not exist | Login/README vs seed/runtime | Demo trust break |
| High | Analytics is stale/hard-coded | `AnalyticsPage.vue` uses `orders` | Manager sees irrelevant data |
| High | Hidden routes/features | router/sidebar mismatch | Users cannot find product value |
| High | 179/180 imported objects are draft/no geometry | SQLite data | Map value mostly absent |
| High | API docs imply more than handler supports | generated API files | Integration trust issue |
| High | Security signals are demo-only | passwords/token/client RBAC | Enterprise blockers |
| Medium | Dashboard empty by default | user settings empty | Manager value delayed |
| Medium | Reference fields select schemas, not objects | `EntityFieldRenderer.vue` pattern | Broken relational UX |
| Medium | Native `window.confirm` for delete | Registry deletion | Low trust for admin workflows |
| Medium | Mobile unsupported | global CSS `min-width: 1024px` | Acceptable only if desktop product |

### UX recommendation

Make one complete "golden path" impossible to miss:

**Create entity -> import file -> fix data quality -> publish objects -> see map/dashboard -> open card -> export/report.**

Everything outside that golden path should be either wired fully or hidden from demo navigation.

## 9. MVP Definition

### MVP must-have

- Admin login and clean demo tenant.
- Entity templates and entity builder.
- Field types: text, number, boolean, date, enum, address, file, reference.
- Dictionary management.
- Import wizard with validation/geocoding.
- Post-import quality queue.
- Registry with search/filter/status/bulk edit/export.
- Object form/card/map/documents/history.
- Global map with layers.
- Dashboard defaults per template.
- Basic role model for admin/operator/manager/viewer.
- Object audit.

### MVP should-have

- PDF/ZIP object report.
- Configurable dashboard blocks.
- Read-only generated API/OpenAPI.
- Layer style/color rules.
- Address suggestions.
- Bulk geocoding/retry.

### MVP could-have

- Workflow builder/actions/tasks.
- Geo rules.
- API write operations.
- Comments/mentions.
- Advanced analytics.

### Postpone or hide until robust

- Hard-coded analytics.
- Workflow/geo rules as primary demo story if still hidden.
- CRUD API docs if actual HTTP handler is read-only.
- Enterprise language around SSO/audit/SLA/backups.

## 10. Positioning

### Best current positioning

**Low-code GIS-реестры для муниципалитетов.**

Short positioning:

> Для муниципальных департаментов, которые ведут городские объекты в Excel и разрозненных картах, LowCode GIS Platform позволяет быстро собрать настраиваемый реестр с картой, импортом, геокодингом, карточками, аудитом и отчётами без кастомной разработки под каждый справочник.

### Alternative positioning options

| Option | Fit | Why |
|---|---|---|
| Low-code GIS registries | Strong | Best supported by code |
| Municipal workflow/BPM | Medium/weak now | Workflow is hidden/unwired |
| Data import/geocoding cockpit | Strong but narrower | Current pain visible in data |
| Government data platform | Too broad | Enterprise backend missing |
| Asset management system | Plausible | Needs stronger domain templates and lifecycle |

### Differentiation hypothesis

The product can win when the alternative is:

- Excel + manual map;
- custom one-off internal system;
- generic low-code without GIS;
- GIS system without business forms/import/audit.

The differentiation should be: **schema builder + import/geocoding + map + registry/card/dashboard in one flow**.

## 11. Competitors and Alternatives

### Direct categories

- Municipal GIS platforms.
- Asset management/field operations systems.
- Government low-code platforms.
- Regional digital government platforms.
- отраслевые реестровые системы.

### Indirect categories

- Excel/Google Sheets + manually maintained maps.
- 1C/ERP/CRM custom forms.
- Custom development by contractor.
- BI dashboards without operational editing.
- Paper/email approval processes.

### Main competitive battle

The first competitor is probably not another polished SaaS. It is **Excel plus organizational habit**.

The product must prove:

- faster setup than custom development;
- safer updates than Excel;
- better map/data quality than manual GIS;
- clearer accountability than email;
- lower total cost than separate GIS + workflow + BI stack.

## 12. Business Model

### Plausible models

| Model | Fit | Notes |
|---|---|---|
| Annual subscription per municipality | High | Best for SaaS/regional rollout |
| Per-seat subscription | Medium | Works if many operators/managers |
| Implementation + support | High | Municipal buyers often need onboarding |
| Module pricing | Medium | GIS/import/API/workflow/reporting modules |
| On-prem enterprise license | High for gov | Requires real backend/security/deployment story |
| Usage-based API/geocoding | Low/medium | Could supplement, not primary |
| White-label regional platform | Medium/high | Good if selling to regional operator |

### What is unknown

- Willingness to pay.
- Procurement path.
- Budget owner.
- Required certifications/security constraints.
- Cloud vs on-prem preference.
- Whether buyers want a builder or a ready vertical template.

## 13. Enterprise Readiness

| Capability | Current state | Rating |
|---|---|---|
| Multi-tenancy | Not real in runtime | Low |
| Organizations | Present, simple | Medium-low |
| Users | Present | Medium-low |
| Password security | Demo/unsafe | Low |
| RBAC | Client-side/partial | Low |
| Field-level permissions | Missing | Low |
| Audit | Object-level useful | Medium |
| API | Demo/read-mostly | Low |
| API auth/rate limits | Missing | Low |
| SSO/LDAP/OIDC | Missing | Low |
| Backups/restore | Missing | Low |
| Data retention policies | Missing | Low |
| PostGIS/backend | Target docs only | Low |
| Import/export | Good MVP | Medium |
| Reporting | Object PDF/ZIP + dashboard | Medium |
| Monitoring/SLA | Missing | Low |
| On-prem deployment | Not proven | Low |
| Static demo deployment | Supported | High for demo |

### Enterprise conclusion

Enterprise readiness score: **2/10**.

The product can be sold only as a prototype/pilot unless the buyer explicitly accepts demo/local constraints. For public sector or enterprise procurement, the next architecture milestone is a backend with secure auth, tenant isolation, Postgres/PostGIS, file storage, API auth, backups and audit policy.

## 14. Data and Architecture

### Current architecture

Frontend:

- Vue 3 + TypeScript + Vite.
- Pinia stores.
- PrimeVue UI.
- OpenLayers map.

Runtime/domain:

- `AppDatabase` contains arrays of domain objects.
- `Repository` layer acts as persistence, migration, business logic and derived behavior.
- `EntitySchema` drives registry/form/card/map behavior.
- `EntityObject.values` stores dynamic field values.

Storage modes:

- Dev SQLite endpoint.
- Static/localStorage mode.
- JSON-like per-table SQLite storage in dev.

### Architecture strengths

- Metadata-driven design is coherent.
- Schema/object split is a good basis for no-code/low-code.
- Domain model already anticipates workflows, geo rules, layers, audit, attachments, dashboard and API.
- Static mode is useful for demos and GitHub Pages.
- Repository migrations show pragmatic handling of evolving demo data.

### Architecture risks

| Risk | Why it matters |
|---|---|
| Repository does too much | Persistence, migration, normalization, status, audit, default workflow/layer creation are mixed |
| JSON blobs in SQLite | No relational integrity, no real query model, hard to scale |
| Client-side RBAC | Not secure |
| Static/localStorage mode | Fine for demo, dangerous if confused with production |
| Attachments as data URLs | Storage size and performance limits |
| Status overloaded | Data quality status and workflow state share object `status` |
| No schema versioning | Changing fields can break historical objects/imports |
| API mismatch | Catalog and handler diverge |
| External geocoding in frontend | Token exposure, vendor limits, privacy concerns |
| No tenant model | Cannot safely run many municipalities |

### Target data model

The repository already has `docs/postgres-3nf-schema.md`, which is the right direction. A production model should include:

- Tenant/Municipality.
- Organization tree.
- User.
- Role.
- Permission.
- EntityTemplate.
- EntitySchema.
- EntitySchemaVersion.
- EntityField.
- Dictionary.
- DictionaryItem.
- EntityObject.
- EntityObjectValue typed tables or JSONB with indexes.
- Geometry/PostGIS.
- Workflow.
- WorkflowState.
- WorkflowTransition.
- Task.
- GeoRule.
- GeoValidationEvent.
- ImportBatch.
- ImportRow.
- Attachment/FileObject.
- AuditEvent.
- DashboardBlock.
- APIClient.
- Webhook.
- IntegrationJob.

### Data model product issue

Current object status should be split into at least two concepts:

- **Data quality/publication status:** draft, invalid, ready, published.
- **Business workflow state:** new, review, approved, closed, etc.

Otherwise import validation and workflow transitions compete for the same field.

## 15. Analytics

### Current analytics state

**Fact.** There is object/audit-level operational history, but no product telemetry. `AnalyticsPage.vue` is hard-coded to an `orders` schema and contractor fields, while current data contains `Школы`.

### Product analytics gaps

- No activation funnel.
- No import success funnel.
- No dashboard usage metrics.
- No map engagement metrics.
- No retention cohorts.
- No role-based usage.
- No API usage telemetry.
- No error telemetry for geocoding/import validation.

### Suggested North Star Metric

**Weekly active maintained geo-objects:** number of published, geo-located objects that were viewed, updated, exported, or reported in active municipal registries during the week.

Alternative for early MVP:

**Imported-to-published conversion:** percentage of imported rows that become valid, geo-located, published objects within 7 days.

### Funnel metrics

Activation:

- Admin creates first entity.
- Admin publishes entity.
- Admin imports first file.
- At least 20 valid objects are published.
- First dashboard block is viewed.

Import health:

- File uploaded.
- Columns mapped.
- Rows validated.
- Rows geocoded.
- Rows imported.
- Rows fixed after validation.
- Rows published.

Engagement:

- Weekly active users by role.
- Registry searches/filters.
- Object edits.
- Map opens/object selections.
- Dashboard views.
- Exports/reports.

Retention:

- Weekly active registries.
- Repeat imports.
- Repeat object updates.
- Tasks completed if workflow is enabled.

### Event taxonomy

Recommended events:

- `user_logged_in`
- `entity_schema_created`
- `entity_schema_published`
- `entity_schema_edited`
- `dictionary_created`
- `import_started`
- `import_file_uploaded`
- `import_mapping_completed`
- `import_validation_completed`
- `import_completed`
- `import_failed`
- `geocode_requested`
- `geocode_succeeded`
- `geocode_failed`
- `object_created`
- `object_updated`
- `object_deleted`
- `object_bulk_edit_started`
- `object_bulk_edit_completed`
- `object_status_changed`
- `map_opened`
- `map_layer_toggled`
- `map_object_selected`
- `dashboard_block_created`
- `dashboard_viewed`
- `export_started`
- `export_completed`
- `report_created`
- `api_catalog_opened`
- `api_request_copied`
- `workflow_transition_started`
- `workflow_transition_completed`
- `workflow_transition_blocked`
- `geo_rule_violation_detected`

## 16. Retention and Collaboration

### Current retention loops

- Recurrent registry updates.
- Recurrent imports.
- Dashboard/reporting.
- Audit/history.
- Tasks/workflows intended but weakly wired.

### Missing collaboration

- Comments on objects.
- Mentions.
- Notifications.
- Assignment and due-date inbox visible in nav.
- Approval queue.
- Change requests.
- Review comments on imported rows.
- Watch/subscription to object changes.

### Recommendation

Do not build broad collaboration first. Build a focused **data quality and approval loop**:

1. Import creates invalid/draft rows.
2. Operator fixes rows.
3. Manager reviews/publishes.
4. System tracks reasons, owner and SLA.

This directly supports the current strongest pain visible in the data.

## 17. Integrations

### Current integrations

- DaData address suggestions/geocoding.
- Nominatim/OSM reverse/building lookup.
- OpenStreetMap tiles.
- CSV/XLSX import.
- CSV export.
- PDF/ZIP report.
- Generated API/OpenAPI demo.
- Static GitHub Pages/localStorage mode.
- Dev SQLite runtime endpoint.

### Risks

- Hardcoded DaData token in frontend is not acceptable for production.
- Nominatim usage from frontend can hit policy/limits and reliability issues.
- API has no auth/authorization.
- Data import/export is file-based, not system-integrated.

### Needed integrations by market

For municipal/public sector:

- 1C or existing ERP/accounting sources.
- Regional/municipal GIS.
- Official classifiers/reference registries.
- Object/file storage.
- SSO/LDAP/OIDC.
- Email/SMS/messenger notifications.
- Webhooks and integration jobs.
- BI export or direct database views.

## 18. Product and Technical Risks

| Risk | Probability | Impact | Score | Mitigation |
|---|---:|---:|---:|---|
| Security/demo architecture mistaken for production | 5 | 5 | 25 | Clear demo boundary, backend auth, secrets, RBAC |
| Imported data remains invalid/no geometry | 5 | 4 | 20 | Data quality queue, geocoding retry, validation dashboard |
| Workflow promise not fulfilled | 4 | 4 | 16 | Wire or remove workflow from positioning |
| Too generic for municipal buyer | 4 | 4 | 16 | Lead with vertical templates and golden path |
| Hidden features reduce perceived value | 4 | 4 | 16 | Navigation audit and demo mode cleanup |
| External geocoding limits/privacy | 4 | 4 | 16 | Backend proxy, configurable provider, caching |
| Long government procurement | 3 | 5 | 15 | Pilot package, on-prem/security roadmap |
| API/docs mismatch hurts trust | 4 | 3 | 12 | Align docs with actual handler or implement CRUD |
| Weak analytics/retention evidence | 4 | 3 | 12 | Add telemetry |
| Scaling JSON/local storage | 4 | 4 | 16 | Postgres/PostGIS milestone |

## 19. Missing Features by User Story

| User story | Missing feature |
|---|---|
| As an operator, I need to fix failed imports | Import batch history and remediation queue |
| As a manager, I need to see current registry health | Default dashboard and generic analytics |
| As an admin, I need to trust demo accounts | Seed/login/README consistency |
| As an admin, I need to configure lifecycle | Routed workflow builder and card actions |
| As an admin, I need spatial validation | Routed geo rules and visible validation results |
| As an integrator, I need safe API access | API auth, scoped keys, accurate OpenAPI |
| As a buyer, I need enterprise security | Backend auth, tenant isolation, backups |
| As a user, I need to collaborate | Comments, assignments, notifications |
| As an admin, I need schema evolution | Schema versions and migration previews |
| As a data owner, I need accountability | Better audit policy, object version diff, restore |

## 20. Hypotheses

### Problem hypotheses

1. Municipal teams spend significant time reconciling Excel objects with maps and reports.
2. The biggest pain is not creating forms, but cleaning and maintaining geo-quality.
3. Buyers value fast deployment more than fully custom UI.
4. Operators need spreadsheet-like editing more than classic form-only CRUD.
5. Managers care about completeness, status, deadlines and exceptions, not raw object count.

### Solution hypotheses

1. A template-based entity wizard lowers setup friction enough for non-developers.
2. Import + validation + map is the strongest aha moment.
3. Dashboard defaults per template are required for activation.
4. Workflow should be introduced only after the registry/map/import loop works.
5. A "quality score" for each registry will improve retention.

### Business hypotheses

1. Municipalities will pay for implementation + annual support rather than pure self-serve SaaS.
2. Regional operator/white-label model may scale better than municipality-by-municipality sales.
3. On-prem or private cloud will be required for serious public-sector deals.
4. Integrations with 1C/GIS/classifiers will be decisive for larger deals.

## 21. Roadmap

### P0: Make the prototype coherent

1. Remove inappropriate field and clean current school dataset.
2. Fix seed/login/README account mismatch.
3. Decide which modules are in the product story: registry/import/map first, workflow later.
4. Expose or remove hidden navigation for tasks, analytics, workflows, geo rules and layers.
5. Replace hard-coded analytics with generic schema analytics or hide it.
6. Add default dashboard blocks after entity/template publish or import.
7. Fix reference field behavior so references point to objects, not schemas.
8. Add import result screen with draft reasons and geocoding retry.
9. Move DaData token out of frontend or label as demo-only with backend proxy planned.
10. Make API catalog truthful: read-only if handler is read-only.

### P1: Make it pilot-worthy

1. Data quality queue for imported rows.
2. Workflow actions inside object card.
3. Tasks in sidebar with role-specific inbox.
4. Geo rules in admin navigation and object validation UX.
5. Import batch history with row-level errors.
6. Better deletion confirmation and undo where practical.
7. Role seed for admin/operator/manager/viewer.
8. Generic reporting/dashboard per entity template.
9. Product telemetry events.
10. Demo script and seeded vertical datasets.

### P2: Make it useful for first paying pilots

1. Postgres/PostGIS backend prototype.
2. Secure backend auth and password handling.
3. Tenant/municipality model.
4. File/object storage for attachments.
5. API keys and scoped OpenAPI.
6. Scheduled imports/integration jobs.
7. Notifications for tasks/data quality.
8. Schema versioning.
9. Audit diffs and exportable audit trail.
10. Pilot admin console.

### P3: Enterprise platform

1. SSO/OIDC/LDAP.
2. Full tenant isolation.
3. Backups/restore/retention.
4. Webhooks.
5. Monitoring and admin observability.
6. Deployment packaging/on-prem docs.
7. Security review and threat model.
8. Performance/scalability tests.
9. Integration marketplace/templates.
10. SLA/support processes.

## 22. RICE-style Prioritization

Because there are no real user analytics, scores below are expert estimates.

| Initiative | Reach | Impact | Confidence | Effort | Priority |
|---|---:|---:|---:|---:|---:|
| Clean demo/data/account mismatch | 5 | 5 | 5 | 1 | 125 |
| Hide or wire hidden modules | 4 | 5 | 4 | 2 | 40 |
| Generic analytics/dashboard defaults | 4 | 4 | 4 | 2 | 32 |
| Import remediation queue | 5 | 5 | 4 | 4 | 25 |
| Fix reference fields | 3 | 4 | 4 | 2 | 24 |
| Workflow actions + tasks nav | 3 | 4 | 3 | 3 | 16 |
| Secure secrets/password demo boundary | 4 | 5 | 4 | 4 | 20 |
| API truthfulness/auth | 3 | 4 | 3 | 4 | 9 |
| Postgres/PostGIS backend | 4 | 5 | 3 | 8 | 7.5 |
| Comments/notifications | 2 | 3 | 2 | 4 | 3 |

## 23. Research Plan

### Research goals

- Validate whether municipal teams care more about low-code setup, import/data quality, map, workflow or reporting.
- Identify buyer, budget and procurement route.
- Understand existing data sources and integration requirements.
- Test whether a non-technical admin can configure a useful registry.
- Measure time-to-first-value from Excel to mapped registry.

### Methods

1. 10 problem interviews with municipal operators/managers.
2. 5 buyer interviews with department heads/CIO/digitalization leaders.
3. 5 usability sessions on the golden path.
4. 2 technical discovery sessions with integrators/IT admins.
5. One pilot with real data and a defined success metric.

### Prototype test script

1. Show clean login and choose a vertical template.
2. Create `Школы` or another domain registry.
3. Import a spreadsheet.
4. Resolve invalid rows.
5. Publish valid objects.
6. Open map and card.
7. Show dashboard by district/status/completeness.
8. Export report.
9. Ask what is missing to use this weekly.

### Success metrics for pilot

- Time from raw spreadsheet to first valid map layer.
- Percentage of rows geocoded automatically.
- Percentage of rows published within 7 days.
- Number of manual corrections required.
- Weekly active operators/managers.
- Number of generated reports/exports.
- Buyer-rated confidence to replace current process.

## 24. Customer Development Questions

### Problem interview

1. Какие реестры объектов или процессов вы ведёте сейчас?
2. Где эти данные живут: Excel, 1C, GIS, почта, бумага?
3. Когда вы в последний раз обновляли такой реестр?
4. Что было самым сложным в обновлении?
5. Как вы проверяете адреса и координаты?
6. Как понимаете, какие записи неполные или ошибочные?
7. Кто отвечает за актуальность данных?
8. Какие отчёты собираете регулярно?
9. Сколько времени занимает подготовка отчёта?
10. Как сейчас выглядит согласование изменений?
11. Есть ли аудит: кто, когда, что поменял?
12. Какие системы обязательно должны интегрироваться?
13. Какие данные нельзя хранить в облаке?
14. Кто принимает решение о покупке такой системы?
15. Как выглядит успешный пилот?

### Solution interview

1. Насколько понятен путь от Excel к реестру на карте?
2. Какие поля/шаги в импорте лишние или непонятные?
3. Где вы ожидаете увидеть ошибки геокодинга?
4. Достаточно ли карточки объекта для ежедневной работы?
5. Какие dashboard-блоки нужны сразу?
6. Нужен ли вам конструктор сущностей или готовые шаблоны?
7. Кто в вашей организации сможет настраивать поля?
8. Что должно происходить с черновиками?
9. Нужны ли согласования и задачи на первом этапе?
10. Что должно быть в отчёте/PDF?
11. Какие права доступа критичны?
12. Что помешает использовать это вместо Excel?

### Buyer interview

1. Какая проблема достаточно болезненна, чтобы за неё платить?
2. Какой бюджетный процесс нужен для покупки?
3. Что должно быть в пилоте, чтобы перейти к закупке?
4. Облако допустимо или нужен on-prem/private cloud?
5. Какие требования к безопасности обязательны?
6. Какие интеграции являются deal-breaker?
7. Сколько пользователей будет работать в системе?
8. Кто владелец данных?
9. Какие SLA/поддержка нужны?
10. Сколько стоит текущий ручной процесс?

## 25. What Cannot Be Known From Code

Нельзя достоверно определить:

- Реального покупателя и бюджет.
- Насколько больна проблема для рынка.
- Кто фактически будет администратором платформы.
- Нужен ли low-code builder пользователям или они хотят готовые шаблоны.
- Насколько важен workflow относительно import/map/dashboard.
- Legal/security requirements для целевого сегмента.
- Willingness to pay.
- Procurement cycle.
- Retention drivers.
- Реальные объёмы данных.
- Требования к performance.
- Нужны ли mobile/tablet workflows.
- Какие интеграции обязательны.
- География рынка и конкурентное давление.

## 26. Final Scoring

| Dimension | Score | Rationale |
|---|---:|---|
| Problem clarity | 6/10 | Муниципальная registry/GIS боль правдоподобна, но нет customer evidence |
| Value proposition | 7/10 | Сильная, если сфокусировать на low-code GIS registry |
| Core flow readiness | 6/10 | Create/import/registry/map работает, но data quality flow слабый |
| UX readiness | 6/10 | Хороший каркас, но hidden/stale modules ломают доверие |
| Architecture coherence | 5/10 | Metadata-driven frontend силён, backend/demo storage слабый |
| Scalability | 3/10 | JSON/localStorage/SQLite dev mode, client-side filtering |
| Enterprise readiness | 2/10 | Нет secure backend/tenants/SSO/backups/API auth |
| Configurability | 7/10 | Схемы/поля/дашборды/слои частично сильны |
| Data model readiness | 5/10 | Хорошая доменная база, но нет versioning/tenant/integrity |
| Analytics readiness | 3/10 | Operational audit есть, product telemetry нет |
| Monetization clarity | 4/10 | Модели возможны, но не подтверждены |
| Market potential | 6/10 | Потенциал есть, рынок сложный |
| Differentiation | 6/10 | GIS + low-code + import может отличаться |
| MVP readiness | 6/10 prototype, 4/10 pilot, 2/10 sale | Зависит от цели |
| Sales readiness | 2/10 | Нужны чистые данные, security story, pilot proof |

## 27. Top-10 Next Actions

1. Удалить неприемлемое тестовое поле и очистить текущие school data.
2. Привести seed, login screen и README к одному набору demo accounts.
3. Выбрать первичное позиционирование: low-code GIS registry, а workflow оставить вторым этапом.
4. Навести порядок в navigation: показать или скрыть tasks, analytics, workflows, geo rules, layers.
5. Заменить hard-coded analytics на generic analytics по активной сущности.
6. Добавить post-import data quality queue: причины draft, retry geocode, bulk fix, publish readiness.
7. Добавить default dashboard blocks после создания шаблона/импорта.
8. Исправить reference field UX: выбирать объекты целевой сущности, а не схемы.
9. Сделать demo security boundary: убрать hardcoded token, не показывать production-like auth claims, подготовить backend security roadmap.
10. Провести 10-15 customer discovery интервью и один pilot test с реальной таблицей и метрикой `imported -> geocoded -> published`.

## 28. Evidence Index

Ключевые файлы и места, на которые опирается аудит:

- `README.md` - продуктовая гипотеза, стек, demo routes/accounts, MVP notes.
- `package.json` - Vue/Vite/PrimeVue/OpenLayers/Pinia scripts.
- `src/app/router/index.ts` - runtime/admin routes and guards.
- `src/widgets/app-sidebar/AppSidebar.vue` - visible navigation.
- `src/shared/types/domain.ts` - domain model.
- `src/shared/api/seed.ts` - seed data, only admin role/user in fresh state.
- `src/shared/api/repositories.ts` - persistence, migrations, workflows/layers/default permissions/audit.
- `src/shared/lib/usePermissions.ts` - client-side permission checks.
- `src/pages/login/LoginPage.vue` - demo login UI and advertised accounts.
- `src/pages/admin/AdminEntityCreatePage.vue` - entity creation wizard/templates.
- `src/pages/admin/AdminEntityBuilderPage.vue` - schema builder.
- `src/pages/admin/AdminImportPage.vue` - import wizard.
- `src/widgets/entity/EntityRegistry.vue` - registry/search/filter/bulk/export.
- `src/widgets/entity/EntityForm.vue` - object form/tabs/validation.
- `src/widgets/entity/EntityFieldRenderer.vue` - field rendering and reference-field issue.
- `src/widgets/entity/EntityCard.vue` - card/docs/history/report.
- `src/widgets/map/MapCanvas.vue` - map rendering.
- `src/widgets/map/GeometryEditor.vue` - geometry edit/geocoding flow.
- `src/pages/map/GlobalMapPage.vue` - global map UX.
- `src/pages/dashboard/DashboardPage.vue` - dashboard runtime.
- `src/pages/settings/HomeSettingsPage.vue` - dashboard builder.
- `src/pages/analytics/AnalyticsPage.vue` - hard-coded `orders` analytics.
- `src/pages/tasks/TasksPage.vue` - task inbox route.
- `src/widgets/workflow/WorkflowActions.vue` - workflow actions component not wired.
- `src/widgets/workflow/WorkflowBuilder.vue` - workflow builder component.
- `src/widgets/geo/GeoRuleBuilder.vue` - geo rule builder.
- `src/shared/api/dadata.ts` - DaData frontend token and API calls.
- `src/shared/api/nominatim.ts` - Nominatim integration.
- `src/shared/lib/generatedApi.ts` - generated API catalog.
- `src/shared/lib/generatedApiHttp.ts` - actual generated API HTTP handler.
- `dev-server/generatedApiDevServer.ts` - dev runtime API endpoints.
- `dev-server/sqliteDatabase.ts` - JSON-per-table SQLite dev persistence.
- `docs/postgres-3nf-schema.md` - target production Postgres/PostGIS schema direction.
- `.data/low-code.sqlite` - current runtime database inspected for counts/statuses/geometry.
