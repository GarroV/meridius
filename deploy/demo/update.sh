#!/usr/bin/env bash
# Обновить код открытого демо (D194) до main и пересобрать демо с нуля.
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=deploy/demo/guard.sh
source deploy/demo/guard.sh
require_demo_tree

git pull --ff-only
BUILD_COMMIT=$(git rev-parse HEAD)
export BUILD_COMMIT
docker compose -p meridius-demo --env-file "$DEMO_ENV_FILE" \
    -f deploy/compose.yaml -f deploy/demo/compose.demo.yaml \
    --profile seed build
exec deploy/demo/reset.sh
