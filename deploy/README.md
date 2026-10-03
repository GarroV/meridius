# Прод meridius на Linux-сервере

## Где живёт сейчас

| Что              | Где                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Сервер           | VPS Contabo, Ubuntu 24.04, клон в `/srv/meridius`                                                                     |
| Адрес            | https://meridius.95-111-249-216.sslip.io — временный; постоянный домен будет на Cloudflare                            |
| Фронт Cloudflare | https://meridius.vasiliy-garro.workers.dev — там, где sslip.io заблокирован (как у decimus, D236); код — `front/`     |
| Сеть к прокси    | `edge-meridius`, алиас `meridius-app`; надстройка — канон в `GarroV/vps-infra`, `projects/meridius/compose.edge.yaml` |
| Бэкап            | Ночной, VPS → restic на MUSPELHEIM (`GarroV/vps-infra`, `backup/`)                                                    |
| Стенд разработки | MUSPELHEIM, compose-проект `mac-stands`; на Маке порт 5433 — туннель на него (#174)                                   |

Старый прод на MUSPELHEIM остановлен 28.09.2026 (D160, D161): все задачи `meridius-*`
отключены, база остановлена, том цел, финальный дамп — `C:\backups\meridius-final-2026-09-28.dump`.
Старый адрес `…ts.net:10000/qr` больше не отвечает: наклеек на него не печатали.

План: при переходе на постоянный домен — `PUBLIC_BASE_URL` в `deploy/.env` и пересборка; `TRUSTED_PROXY_HOPS=1` — после проверки
`X-Forwarded-For`.

Как продукт живёт на сервере: что поднимается, в каком порядке, какие ключи окружения ему
нужны и как его обновлять. Стенд разработки сюда не относится — он описан в корневом
README и в #174.

## Что поднимается

`deploy/compose.yaml`, проект compose `meridius`:

| Сервис    | Образ                            | Что делает                                               | Наружу                        |
| --------- | -------------------------------- | -------------------------------------------------------- | ----------------------------- |
| `db`      | `postgres:17-alpine`             | База продукта, том `meridius_pgdata`                     | ничего, даже с самого сервера |
| `migrate` | стадия `migrate` из `Dockerfile` | Накатывает миграции (`scripts/db-migrate.mjs`) и выходит | —                             |
| `app`     | стадия `runner` из `Dockerfile`  | Next.js в самодостаточной сборке, слушает `3000`         | только внутри сети проекта    |

Порядок старта задан зависимостями: `db` здоров → `migrate` отработал **успешно** →
стартует `app`. Упавший накат оставляет приложение в статусе `Created`: оно не стартует
на базе, для которой не готово (инцидент 25.09). Каждое `up` накатывает заново; повторный
накат на свежей базе ничего не меняет.

Здоровье приложения — `GET <BASE_PATH>/healthz`: `200 {"status":"ok"}`, когда процесс
отвечает и база отвечает, `503 {"status":"unavailable"}`, когда база лежит. Этот же адрес
проверяет healthcheck контейнера.

## Подключение к обратному прокси

Порт `3000` не публикуется. Площадка подключает `app` к сети общего Caddy своей
надстройкой поверх этого файла. Её канон — не здесь, а в `GarroV/vps-infra`,
`projects/meridius/compose.edge.yaml`: она про площадку, а не про продукт. Сеть —
`edge-meridius`, алиас приложения в ней — `meridius-app`; Caddy ходит на
`meridius-app:3000`.

В командах ниже `$EDGE` — путь к этой надстройке на сервере.

## Окружение

`deploy/.env` на сервере, рядом с `compose.yaml`; в git не попадает. Шаблон —
`deploy/.env.example`. Знак `$` в значениях не использовать: compose раскрывает его как
подстановку.

| Ключ                        | Что это                                                                                                 | Как получить                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`             | Пользователь базы                                                                                       | любое имя, например `meridius`                                                                                                                 |
| `POSTGRES_PASSWORD`         | Пароль базы. Только `[A-Za-z0-9]`: подставляется в адрес подключения без экранирования                  | `openssl rand -hex 24`                                                                                                                         |
| `POSTGRES_DB`               | Имя базы                                                                                                | `meridius`                                                                                                                                     |
| `PUBLIC_BASE_URL`           | Публичный адрес без завершающего `/`. **Уходит внутрь напечатанных QR-кодов**                           | адрес площадки                                                                                                                                 |
| `BASE_PATH`                 | Путь продукта на адресе: пусто — корень, иначе вида `/qr`                                               | пусто, если продукт отдаётся с корня                                                                                                           |
| `ADMIN_PASSWORD_HASH`       | Хэш пароля администратора (не сам пароль)                                                               | `node scripts/hash-admin-password.mjs` на любой машине с клоном — печатает строку целиком, `ADMIN_PASSWORD_HASH=…`; пароль не короче 12 знаков |
| `SESSION_SECRET`            | Подпись cookie кабинета, от 32 знаков                                                                   | `openssl rand -hex 32`                                                                                                                         |
| `DEVICE_SESSION_SECRET`     | Подпись cookie планшета станции, от 32 знаков, **отличный** от `SESSION_SECRET`                         | `openssl rand -hex 32`                                                                                                                         |
| `TRUSTED_PROXY_HOPS`        | Сколько доверенных посредников перед продуктом                                                          | `1` за одним прокси — после проверки из `docs/furca/blocks/fill.md` (раздел про туннель); до неё `0`                                           |
| `GOOGLE_CLIENT_ID`          | Вход через Google (D176): идентификатор OAuth-клиента Meridius. Пусто — кнопки нет, вход только паролем | Google Cloud → Credentials → OAuth client (Web application), экран согласия External                                                           |
| `GOOGLE_CLIENT_SECRET`      | Секрет того же клиента                                                                                  | там же, рядом с идентификатором                                                                                                                |
| `GOOGLE_REDIRECT_URI`       | Адрес возврата; побуквенно как в консоли Google                                                         | `<PUBLIC_BASE_URL><BASE_PATH>/admin/login/google/callback`                                                                                     |
| `GOOGLE_FRONT_REDIRECT_URI` | Адрес возврата для входа через фронт Cloudflare; пусто — через фронт тот же прямой                      | `https://meridius.vasiliy-garro.workers.dev/admin/login/google/callback`                                                                       |

`DATABASE_URL` не задаётся: compose собирает его сам из трёх ключей базы.

`PUBLIC_BASE_URL` и `BASE_PATH` **запекаются в сборку** (D033, D045), а также коммит
(`BUILD_COMMIT`, подпись в подвале кабинета). Их смена — это пересборка
(`up -d --build`), простой перезапуск продукт не меняет. После смены адреса все ранее
напечатанные наклейки ведут на старый адрес.

## Фронт Cloudflare

Там, где sslip.io заблокирован, продукт открывается через Worker
`https://meridius.vasiliy-garro.workers.dev` — копию фронта decimus (decimus D236).
Worker пересылает запрос на площадку как есть, подставляя адрес посетителя и ключ фронта;
Caddy верит адресу и ставит метку `X-Meridius-Front` только при верном ключе, прямому
запросу все три заголовка снимает (`GarroV/vps-infra`, `edge/sites/meridius.caddy`).
По метке вход через Google берёт `GOOGLE_FRONT_REDIRECT_URI`: метка похода лежит в куке
адреса фронта, и возврат на прямой адрес её бы не нашёл.

- код и настройки — `front/src/index.js`, `front/wrangler.jsonc`; выкладка `npx wrangler deploy` из `front/`;
- ключ фронта — секрет `FRONT_KEY` у Worker'а и `/srv/edge/sites/meridius-front.snippet` на VPS, вне git;
  меняются вместе, иначе Caddy перестаёт узнавать фронт.

## Первый запуск

```sh
git clone https://github.com/GarroV/meridius.git /srv/meridius
cd /srv/meridius
cp deploy/.env.example deploy/.env    # заполнить по таблице выше
BUILD_COMMIT=$(git rev-parse HEAD) \
  docker compose -f deploy/compose.yaml -f "$EDGE" up -d --build
docker compose -f deploy/compose.yaml ps -a     # migrate: Exited (0), app: healthy
```

## Обновление

```sh
cd /srv/meridius
git pull --ff-only
BUILD_COMMIT=$(git rev-parse HEAD) \
  docker compose -f deploy/compose.yaml -f "$EDGE" up -d --build
```

Одна команда делает всё в правильном порядке: `--build` пересобирает образы из свежего
кода, затем compose поднимает `db`, прогоняет `migrate` и только после его успеха
пересоздаёт `app`. Отдельного шага миграций руками нет — забыть его нельзя.

Проверка после обновления:

```sh
docker compose -f deploy/compose.yaml ps -a          # migrate: Exited (0), app: healthy
docker compose -f deploy/compose.yaml logs migrate   # «Миграции накатаны»
docker compose -f deploy/compose.yaml logs --tail 30 app
```

Сквозной смоук на площадке — `node scripts/mvp-smoke.mjs --url <PUBLIC_BASE_URL> --password
<пароль>`: он сверяет базу напрямую, поэтому ему нужен `DATABASE_URL` до базы площадки, и
работает он только на демо-контуре (`npm run seed:demo`). На боевой базе его не гонять.

## Журнал

Всё, что продукт пишет в stdout и stderr, Docker кладёт в журнал контейнера: драйвер
`json-file`, ротация 5 файлов по 10 МБ на сервис (`x-logging` в `compose.yaml`). Упавший
запрос оставляет там стек и `digest` — тот же код, что экран ошибки показывает человеку
(«Код ошибки: …»), поэтому разбор начинается с кода с экрана, а не с переписки.

```sh
docker compose -f deploy/compose.yaml logs --since 24h app | grep -B2 -A30 '<код с экрана>'
docker compose -f deploy/compose.yaml logs --tail 200 app
```

Журнал переживает перезапуск контейнера и ребут сервера, но **не пересоздание**:
`up -d --build` заводит новый контейнер `app`, и журнал прежнего удаляется вместе с ним.
Разбор свежего падения — до обновления, или сохранить журнал перед ним:

```sh
docker compose -f deploy/compose.yaml logs --no-color app > ~/meridius-app-$(date +%F-%H%M).log
```

Смена ротации действует только на заново созданный контейнер (`up -d`), не на `restart`.

## Данные вне git

`packet.json` (исходный пакет чек-листов) продукту **в рантайме не нужен**: его читает
только разовый импорт `node scripts/import-checklists.mjs <путь>`. Держать его на сервере
незачем. Если импорт понадобится на проде, его запускают с машины, у которой есть клон и
доступ к базе площадки, указывая путь к локальной копии пакета; класть пакет в клон
нельзя — данные вне git живут вне рабочего дерева.

То же для справочника сети (`npm run import:network -- <путь>`).

Шаблоны из пилотных чек-листов (`npm run templates:from-store -- "<пиццерия>"`, D174) — тоже разовый скрипт. Сначала без `--apply`: скрипт печатает план и ничего не меняет; повторный прогон с `--apply` ничего не делает. База наружу не открыта, поэтому на сервере его гоняют из стадии `build` образа (после `up --build` она в кэше, исходники и зависимости там есть) в сети проекта, собирая `DATABASE_URL` из `POSTGRES_*` окружения внутри контейнера:

```sh
docker build -q --target build -t meridius-tools .
docker run --rm --network meridius_default --env-file deploy/.env meridius-tools \
  sh -c 'export DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@db:5432/$POSTGRES_DB"; node scripts/templates-from-store.mjs "<пиццерия>"'
docker image rm meridius-tools
```

На проде прогнан 30.09.2026 для «Demoland, Pilot»: 9 шаблонов.

## Откат

Код: `git checkout <прошлый коммит>` и та же команда `up -d --build`. Миграции сами
не откатываются: `npm run db:rollback` снимает последнюю, и делать это надо осознанно, до
отката кода, с `DATABASE_URL` до базы площадки.
