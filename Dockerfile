# Образы продукта для прода: приложение (`runner`) и одноразовый накат миграций (`migrate`).
# Собираются на сервере из клона репозитория; как и в каком порядке — deploy/README.md.
#
# Устройство взято у официального примера Next.js (examples/with-docker): самодостаточная
# сборка `.next/standalone` кладёт рядом `server.js` и только те модули, которые продукт
# реально загружает, поэтому в образ приложения не едут ни devDependencies, ни исходники.

ARG NODE_IMAGE=node:24-alpine

# ── Зависимости: общие для сборки ───────────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ── Сборка ──────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Три значения ЗАПЕКАЮТСЯ в сборку (D033, D045): путь продукта, публичный адрес, который
# уходит внутрь напечатанного QR-кода, и коммит для подписи в подвале кабинета. Смена
# любого из них — это пересборка образа, а не перезапуск контейнера.
ARG BASE_PATH=""
ARG PUBLIC_BASE_URL=""
ARG BUILD_COMMIT=""
ENV BASE_PATH=${BASE_PATH} \
    PUBLIC_BASE_URL=${PUBLIC_BASE_URL} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    NEXT_OUTPUT_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx --no-install next build

# ── Рабочие зависимости: только для образа миграций ─────────────────────────────
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ── Накат миграций: запускается до приложения и завершается ─────────────────────
# Тот же скрипт, что `npm run db:migrate` на машине разработчика. Код возврата решает,
# стартует ли приложение: compose ждёт `service_completed_successfully`.
FROM ${NODE_IMAGE} AS migrate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts/db-migrate.mjs ./scripts/
COPY src/blocks/data/migrator.ts ./src/blocks/data/
COPY src/blocks/data/migrations ./src/blocks/data/migrations
USER node
CMD ["node", "scripts/db-migrate.mjs"]

# ── Приложение ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
# BASE_PATH и PUBLIC_BASE_URL повторяются и в окружении рантайма: проверка здоровья и
# серверный код читают их оттуда, и значение обязано совпадать с запечённым.
ARG BASE_PATH=""
ARG PUBLIC_BASE_URL=""
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    BASE_PATH=${BASE_PATH} \
    PUBLIC_BASE_URL=${PUBLIC_BASE_URL} \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
# Здоровье — это «процесс отвечает И база отвечает» (src/app/healthz/route.ts). curl в
# образе нет, поэтому запрос делает сам node.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+(process.env.BASE_PATH||'')+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server.js"]
