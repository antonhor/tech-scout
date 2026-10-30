# Clutch Collector · TechScout

Chrome extension (Manifest V3) to collect an agency from the **already loaded** Clutch profile, edit all fields and save to a personal Google Sheet. No paid services, scraping requests, automatic navigation, AI or external database. English UI; setup below is in Russian.

## Что реализовано

Ручной Scan Company, редактируемые поля и списки через запятую, предупреждения о пропущенных данных, сохранение черновика, проверка дублей по URL профиля / домену / имени, сравнение и редактирование объединённых значений, Skip / Update / Cancel. При первом показе дубля пустые новые значения не стирают существующие; после объединения пользователь может явно очистить поле или удалить технологию. Название и Clutch URL обязательны.

Запись защищена ScriptLock, UUID создания обеспечивает повторную отправку без новой строки. Обновление ищет стабильный ID, сверяет SHA-256 всей строки, повторно проверяет дубли, сохраняет Created At. Если найдено несколько конфликтующих записей, автоматическое объединение строк запрещено: исправьте дубли в таблице и повторите проверку. Формулы в пользовательских строках экранируются апострофом. Заголовки существующего листа не перезаписываются.

## Структура и поток данных

```
src/background/    подписанные запросы и сохранение последнего результата
src/content/       изолированное чтение DOM, Clutch extractor и селекторы
src/popup/         состояния интерфейса, черновик, проверка и разрешение дублей
src/options/       URL подключения, сессионный ключ, тест, очистка
src/services/      сетевой клиент, валидация ответа
src/shared/        модели, переносимый URL parser, нормализация, дубли, валидация
apps-script/       Web App, авторизация, блокировки, работа с Companies
tests/fixtures/    синтетические HTML-профили
scripts/           упаковка расширения и Apps Script
```

Popup → injected isolated content script → preview → explicit confirmation → service worker → signed POST → Apps Script → locked duplicate check and write → confirmed response. Дополнительный extractor реализует `CompanyExtractor`; Google Sheets не зависит от DOM Clutch.

## Требования и локальный запуск

Node.js 20.19+ или 22.12+, npm, Chrome 120+, Google-аккаунт с доступом к Sheets и Apps Script. Организация должна разрешать Web Apps с доступом Anyone; иначе этот вариант интеграции неприменим, потребуется другой механизм авторизации.

```sh
npm install
npm test
npm run lint
npm run build
```

`npm run dev` запускает Vite для разработки HTML; полноценное расширение проверяйте через сборку и Reload в Chrome. `npm run format` форматирует проект. Для воспроизводимой установки после первого разрешения зависимостей используйте `npm ci` с package-lock.json.

## Создание таблицы и Apps Script: пошагово

1. Создайте пустую Google-таблицу. Скопируйте ID из `https://docs.google.com/spreadsheets/d/ID/edit`.
2. Откройте **Расширения → Apps Script**. Назовите проект Clutch Collector.
3. После `npm run build` скопируйте **весь** `dist/apps-script/Code.js` в файл Code.gs редактора. Это скомпилированный JavaScript; TypeScript напрямую не вставляйте.
4. В настройках проекта включите отображение `appsscript.json`, замените его содержимым `dist/apps-script/appsscript.json`.
5. В **Project Settings → Script Properties** добавьте `SPREADSHEET_ID` и `SIGNING_KEY`. Ключ должен быть случайным, минимум 32 символа. Например, локально сгенерируйте `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Не отправляйте ключ в чат и не коммитьте.
6. Выберите функцию `setup` в редакторе, нажмите Run, подтвердите доступ к своим таблицам. Создаётся только лист Companies с колонками ID, Company Name, Website, Programming Languages, Frameworks & Technologies, Domain, Clutch URL, Notes, Created At, Updated At. Другие листы не меняются. Старая стандартная схема автоматически мигрирует в новый порядок; неизвестные или вручную переставленные заголовки не изменяются и вызывают ошибку конфигурации. Подробности обновления существующей таблицы ниже.
7. Нажмите **Deploy → New deployment → Web app**. Execute as: **Me**; Who has access: **Anyone**. Google transport доступен публично, но каждая операция приложения требует корректной HMAC-подписи. Без подписи чтение и запись запрещены.
8. Нажмите Deploy, подтвердите разрешения. Скопируйте URL вида `https://script.google.com/macros/s/DEPLOYMENT_ID/exec`. `/dev` для расширения не подходит.
9. При изменениях: замените Code.gs, затем **Deploy → Manage deployments → Edit → New version → Deploy**. Это сохраняет URL. Простое сохранение кода не обновляет существующую версию Web App.

Необязательный clasp: `npx @google/clasp login`, создайте локальный `.clasp.json` с `scriptId` проекта и `rootDir: "dist/apps-script"`, затем `npx @google/clasp push`. Создание/обновление deployment выполняйте отдельно через редактор или команды clasp. `.clasp.json` исключён из Git; build перед push обязателен.

## Local Apps Script connection with clasp

The project includes pinned `@google/clasp` and uses a separate Google credential profile named `techscout`. The ignored local `.clasp.json` binds the existing Script ID to `dist/apps-script`, so only the compiled `Code.js` and `appsscript.json` are selected for upload. Google credentials (`.clasprc*.json`) must never be committed.

```sh
npm run apps:login        # One-time Google consent for the techscout profile
npm run apps:account      # Show the authorized account; does not print tokens
npm run apps:status       # Preview the local files selected for upload
npm run apps:deployments  # Read the existing project's deployments
npm run apps:push         # Build, then upload code; does not publish a new Web App version
npm run apps:deploy       # Publish uploaded code to the existing deployment configured locally
```

Enable the Apps Script API for the owning Google account at <https://script.google.com/home/usersettings> if Google reports that it is disabled. If an old login reports insufficient authentication scopes, authorize the dedicated profile with `npm run apps:login`; do not share OAuth callback codes, tokens or SIGNING_KEY in chat.

The ignored `.clasp.deploy.json` contains both the Script ID and the existing versioned deployment ID. `apps:deploy` checks that the Script ID matches `.clasp.json` and always supplies the configured deployment ID, avoiding accidental creation of another Web App URL. Preview the target without publishing:

```sh
npm run apps:deploy -- --check
```

Normal update sequence: `npm run apps:push`, then `npm run apps:deploy`. The second command publishes the code already uploaded, rather than uploading local edits itself. Uploading replaces the remote project file set: review/back up remote-only files before the first push. An initial remote snapshot is saved under ignored `.clasp-backups/`. The local manifest retains the remote Web App's `USER_DEPLOYING` / `ANYONE_ANONYMOUS` transport settings; HMAC request authentication is unchanged. No setup function or spreadsheet migration is part of connecting clasp.

Tooling note: clasp 3.4.1 currently depends on Zod 3.25.76. `npm audit` reports two high-severity findings through that upstream dependency, used by clasp's optional MCP server. This project uses the CLI commands and does not start that server. No forced major dependency override or downgrade is applied.

## Updating an existing sheet: column order migration

The Companies worksheet now uses this order:

| Column | Header                    |
| ------ | ------------------------- |
| A      | ID                        |
| B      | Company Name              |
| C      | Website                   |
| D      | Programming Languages     |
| E      | Frameworks & Technologies |
| F      | Domain                    |
| G      | Clutch URL                |
| H      | Notes                     |
| I      | Created At                |
| J      | Updated At                |

To update an existing deployment:

1. Run `npm run build` and replace Code.gs with `dist/apps-script/Code.js`.
2. Run `setup` from the Apps Script editor to migrate the existing Companies sheet. A new sheet uses the new order immediately. The first signed API request also migrates an old sheet if setup has not yet been rerun.
3. Publish **Deploy → Manage deployments → Edit → New version → Deploy**, retaining the current URL. The extension UI, request/response models and signing key do not change.
4. Check D:E and run Test Connection. Recheck any duplicate preview opened before migration: its old concurrency token will safely be rejected.

Migration recognizes the exact original A:J headers (`ID, Company Name, Website, Domain, Clutch URL, Programming Languages, Frameworks & Technologies, Notes, Created At, Updated At`). While holding the script lock, it moves the complete original F:G columns into D:E using [Sheet.moveColumns](https://developers.google.com/apps-script/reference/spreadsheet/sheet). Google Sheets shifts the other columns; migration does not read and rewrite cell values. Cell contents, formulas, formatting and appended columns K onward remain with their columns, and other worksheets are untouched. Formula references follow Google Sheets' native move behavior. Header order is checked again after the move before API reads or writes proceed.

Running setup or API operations again on the updated layout makes no further moves. Unknown, duplicate or partially reordered required headers are rejected without migrating or writing company data. If protected ranges or another Sheets restriction prevent moving columns, the operation fails without appending/updating a company. Resolve that restriction and rerun setup; do not manually rename headers over existing data. Use the updated backend for this layout; older backend versions reject the new headers rather than write using obsolete offsets. The actual migration must still be verified in your Google account; automated migration tests use in-memory Google service adapters.

## Updating the Web App: partial legacy record duplicate fix

Duplicate detection now accepts existing imported records with missing or invalid Clutch URLs. Only available, successfully normalized values participate in matching, in the same order: Clutch URL, domain derived from Website in column C, then normalized company name as a possible duplicate. Empty identifiers never match. Malformed existing URLs make only that comparison key unavailable; they do not abort the entire scan. New submissions still require a valid Clutch profile URL and a valid website when supplied. Column F does not need to be populated for domain matching.

Numeric imported IDs remain numeric in responses and on explicitly confirmed updates; UUIDs and text IDs keep their values and types. Old cached previews with string representations of numeric IDs remain compatible. Missing and colliding IDs still produce configuration errors. Checks do not backfill Domain or Clutch URL cells, renumber records, or rewrite imported rows. The existing headers and column mappings are unchanged, as is the explicit duplicate confirmation workflow.

To update the existing Web App:

1. Run `npm ci` if dependencies are not installed, then `npm test`, `npm run lint`, and `npm run build`. The build also runs the TypeScript check and refreshes `dist/apps-script/Code.js`.
2. Open the Apps Script project for the exact `/exec` URL configured in extension Settings. Replace the complete contents of Code.gs with **the freshly built `dist/apps-script/Code.js` from this workspace**, then save. Alternatively, if clasp is already configured, run `npx @google/clasp push` with `rootDir` pointing to `dist/apps-script`; pushing alone does not update the Web App deployment.
3. Keep `SPREADSHEET_ID`, `SIGNING_KEY` and the existing sheet unchanged. No setup run, column move or data migration is required for this fix on the current A:J layout. The previously implemented old-layout migration is unchanged; do not run it as part of this repair.
4. Choose **Deploy → Manage deployments → select the existing Web App deployment → Edit (pencil) → Version: New version → Deploy**. Retain the existing deployment, URL and access settings. Do not merely save code or create an unrelated deployment.
5. After deployment, cancel any old duplicate preview and scan again. Check a genuinely new company and an imported website duplicate; only explicitly confirm an insertion/update when you intend to modify the sheet. Test Connection alone does not scan existing company rows.

An extension-only rebuild/reload is **not required**: matching and ID persistence changes execute in Apps Script, and the existing popup passes the returned ID back unchanged. `npm run build` is needed to produce the updated backend JavaScript. Do not use the older `dist.crx` archive as a source of backend code; it is a separate stale package. No deployment or live-sheet changes are performed by the automated tests/build. Regression tests use in-memory Google service adapters, including 125 numeric-ID imports mixed with UUID records; live acceptance requires your Google account.

## Установка расширения

1. Выполните `npm run build`.
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → выберите папку **dist** в TechScout.
3. Откройте Settings расширения, введите `/exec` URL и тот же SIGNING_KEY. Нажмите Save configuration, затем Test Connection. Успех показывается только после ответа сервера с проверенными заголовками Companies.
4. Откройте индивидуальный профиль `https://clutch.co/profile/company`, дождитесь загрузки нужных секций. Откройте расширение → Scan Company.
5. Проверьте название, официальный сайт, языки, технологии, URL и заметки. Не найденные поля заполните вручную; неизвестные технологические метки находятся в Technologies и требуют проверки классификации.
6. Confirm saving. При дубле выберите строку, сравните существующие значения с редактируемым предложением и подтвердите Update, Skip или Cancel.
7. После перезапуска Chrome повторно введите ключ в Settings. URL и черновики остаются локально; Reset очищает черновики и последний результат, Forget session key удаляет ключ.

## Контракт API

Все операции используют POST с Content-Type `text/plain;charset=UTF-8`, содержимое JSON:

```ts
{ timestamp: number, nonce: string, body: string, signature: string }
// signature = hex(HMAC-SHA256(key, `${timestamp}\n${nonce}\n${body}`))
// body = JSON.stringify({ operation, requestId, agency?, id?, token? })
```

Операции: healthCheck, checkDuplicate, createCompany, updateCompany, skip. Ответ `{success, status, data?, error?: {code,message}}`. Статусы: ADDED, UPDATED, SKIPPED, DUPLICATE_FOUND, VALIDATION_ERROR, CONFIGURATION_ERROR, NETWORK_ERROR (клиент), SERVER_ERROR. HealthCheck и отсутствие дублей возвращают SKIPPED без записи. DUPLICATE_FOUND содержит `{candidates:[{agency,token,reason}]}`; reason `name` означает только возможный дубль. Обновление отправляет полную явно подтверждённую запись и token выбранной строки. Номер строки клиент не передаёт.

Дата подписи допустима в пределах двух минут. Nonce проверяется в краткосрочном ScriptCache под блокировкой; cache best effort, поэтому безопасность записи не зависит от него: UUID и проверка версии строки защищают повторные записи. requestId создания хранится как ID самой строки, без срока жизни кеша. Не меняйте его вручную. При таймауте исход записи неизвестен: повторите тот же черновик; для создания сервер вернёт существующий результат, для обновления проверка версии предотвратит вторую запись.

## Безопасность и ограничения

Личный ключ **не встроен в исходники** и хранится только в `chrome.storage.session` (память браузера, недоступная content scripts по умолчанию), а на сервере — в Script Properties. Локальные настройки и черновики в storage.local не содержат ключа. Пользователь с доступом к DevTools/профилю Chrome или редактор проекта Apps Script может извлечь ключ. Это практичная личная интеграция, не многопользовательская OAuth-система. Для отзыва смените SIGNING_KEY. Не используйте запоминаемый пароль вместо случайного ключа.

Apps Script Web App с исполнением от владельца и Google-login-only не предоставляет здесь надёжный бесшовный OAuth/CORS-поток для произвольного origin расширения. Поэтому используется прикладная HMAC-авторизация поверх HTTPS с публичным transport. Секрет не передаётся в запросе. Подпись охватывает всё тело, дату и nonce. Неавторизованные запросы всё же могут расходовать квоту Apps Script; защита от DoS отсутствует. Если политика организации запрещает такой deployment, не ослабляйте авторизацию: используйте другой backend/OAuth-дизайн.

Запросы выполняет service worker с host permissions только script.google.com и script.googleusercontent.com (нужен для redirect ContentService), без Clutch host permission и без all-urls. Content script запускается только вручную через activeTab. JSON передаётся как text/plain без произвольных auth-заголовков; браузерный preflight не требуется. Обычная веб-страница с Vite не заменяет расширение при проверке сетевого доступа.

Политика доменов: lowercase, IDN → punycode, удаление только ведущего www, игнорирование схемы/порта/пути/query/fragment при сравнении. `team.example.com` и `example.com` различны. Не используем public-suffix свёртку. Парсер намеренно принимает HTTP(S) DNS/IPv4-hosts без credentials; IPv6 literals не поддерживаются. Profile URL нормализуется отдельно, query/fragment удаляются. Технологии хранятся через запятую; запятые внутри отдельной метки запрещены.

## Проверка и диагностика

Автотесты проверяют нормализацию, классификацию, дедупликацию, валидацию, совпадения, merge, формат ответа, формулы и HTML-фикстуры. Фикстуры **синтетические**: реальные селекторы Clutch и их устойчивость ещё не подтверждены. Центральные селекторы: `src/content/clutchExtractor.ts`; URL-правила: `profilePatterns` в `src/shared/normalization.ts`. При новом формате URL добавьте точное правило и fixture/test. Website выбирается из специально помеченной прямой ссылки внутри корня профиля либо из параметра `u` кнопки `https://r.clutch.co/redirect` с `event_category=visit_website`. При отсутствии `u` допускается `provider_website`; если оба присутствуют, их домены должны совпадать. Кнопка вне корня профиля должна содержать `page_location`, совпадающий с текущим Clutch URL. Ссылки из рекомендаций/отзывов исключаются, переходов по redirect нет, UTM-метки удаляются. При неоднозначности Website остаётся пустым. Контракт redirect проверен тестами по ссылке пользователя; реальная инъекция в Chrome требует ручной проверки. Focus-категории с процентными легендами читаются отдельно от шапки профиля. JSON-LD используется только если @id/mainEntityOfPage совпадает с профилем. Страницы рекомендаций и directory не поддерживаются.

Ручная приёмка после deployment: Test Connection → добавить новую компанию → повторить и убедиться в дубле → Skip без изменений → Update с объединением и удалением метки → изменить строку вручную между проверкой и Update (должна быть ошибка версии) → одновременно сохранить из двух окон (одна новая строка) → закрыть popup во время записи, открыть и проверить результат → перезапустить Chrome (ключ должен исчезнуть). Убедитесь, что `=1+1` в заметках отображается текстом. Эти проверки требуют реального Chrome и вашего Google-аккаунта; локальные unit tests их не заменяют.

Ошибки:

- Unsupported page: откройте индивидуальный HTTPS-профиль Clutch; каталоги и reviews URLs не сканируются.
- Пустые поля: изменился DOM или секция не загружена. Заполните вручную; расширение не кликает и не загружает другие страницы.
- Если диаграмма видна, но технологии пустые: после повторного Scan откройте **Scan diagnostics** под предупреждением. Отчёт содержит версию extractor, найденные категории и фрагменты их DOM без ссылок, скриптов и настроек подключения. Он остаётся в локальном черновике и никуда автоматически не отправляется; его можно скопировать для диагностики. Выпадающие списки, разделённые процентные значения и Focus-sidebar проверены синтетическими тестами; совместимость с вашей загруженной страницей подтверждается только ручным сканированием.
- CONFIGURATION_ERROR: проверьте URL `/exec`, Script Properties, ключ и `setup`.
- HTML вместо JSON / HTTP error: проверьте Anyone, Execute as Me и версию deployment. Перенаправление на Google login не является API-ответом.
- Permission error: владелец deployment должен иметь доступ к таблице и авторизовать setup.
- Quota / busy: повторите позже, не запускайте циклические запросы. После ошибки транспорта сначала проверьте лист — запись могла завершиться.
- Concurrent modification: Cancel и повторный scan/check; чужие изменения не перезаписываются.
- Изменили заголовки/ID вручную: восстановите схему из резервной копии; ID должен быть непустым и уникальным.

При закрытии popup черновик и последний ответ восстанавливаются. При остановке service worker или закрытии браузера ответ может потеряться; повторная проверка дублей и идемпотентность создания остаются обязательными. Конфликтующий update после потерянного ответа требует повторной проверки.

## Квоты и развитие

Бесплатные лимиты Google зависят от аккаунта и могут меняться: [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas). Чтение строк выполняется одним диапазоном, запись — setValues; линейный поиск подходит личной таблице, но не очень большим каталогам. Нет фонового polling, массового импорта и автоматического retry. Возможное развитие: проверенные снимки реальных страниц, дополнительные extractors, индекс для больших таблиц, OAuth-интеграция для команды.

Официальные особенности платформы: [Web Apps](https://developers.google.com/apps-script/guides/web), [ContentService redirects](https://developers.google.com/apps-script/reference/content/content-service), [Chrome extension storage](https://developer.chrome.com/docs/extensions/reference/api/storage).
