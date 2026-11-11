#!/usr/bin/env bash
# Вернуть открытое демо (D194) к исходному виду: база — заново, контур и учётки — заново.
#
# Зовётся cron'ом раз в час (deploy/README.md, «Открытое демо») и из update.sh. Сносит
# ТОЛЬКО контейнеры и том проекта meridius-demo: имя проекта задано здесь константой, а не
# приходит снаружи, чтобы этим скриптом нечем было снести прод.
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=deploy/demo/guard.sh
source deploy/demo/guard.sh
require_demo_tree

project=meridius-demo
compose=(docker compose -p "$project" --env-file "$DEMO_ENV_FILE"
         -f deploy/compose.yaml -f deploy/demo/compose.demo.yaml)

exec 9>"/tmp/$project-reset.lock"
flock -n 9 || { echo "сброс демо уже идёт" >&2; exit 0; }

# Удалить, а не остановить: остановленный контейнер держит том, и `volume rm` отказывает
# («volume is in use») — сброс падал бы со второго запуска.
"${compose[@]}" rm -sf app db
docker volume rm -f "${project}_pgdata" >/dev/null
"${compose[@]}" up -d --wait db
"${compose[@]}" run --rm --no-deps migrate
"${compose[@]}" run --rm --no-deps seed
"${compose[@]}" up -d --wait app
echo "демо пересобрано: $(date -u +%FT%TZ)"
