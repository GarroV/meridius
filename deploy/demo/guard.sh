# shellcheck shell=bash
# Общая сверка для update.sh и reset.sh: работать можно только в дереве демо.
# Подключается через `source` после `cd` в корень дерева; сам ничего не запускает.
#
# Скрипты берут окружение из deploy/demo/.env того дерева, где лежат. Запущенный из боевого
# (`/srv/meridius/deploy/demo/reset.sh`), reset.sh снёс бы тома демо-проекта на боевом
# дереве, а update.sh собрал бы демо с боевыми паролями. Поэтому пускаем только когда
# совпадает ВСЁ: дерево — `/srv/meridius-demo` И в его deploy/demo/.env стоит DEMO_MODE=1.
# Значения `.env` не печатаются: `grep -q`.
DEMO_TREE=${MERIDIUS_DEMO_TREE:-/srv/meridius-demo}
DEMO_ENV_FILE=deploy/demo/.env

require_demo_tree() {
    local here
    here=$(pwd -P)
    if [ "$here" != "$DEMO_TREE" ]; then
        echo "отказ: $here — не дерево демо ($DEMO_TREE). Запускать из $DEMO_TREE." >&2
        exit 1
    fi
    if [ ! -f "$DEMO_ENV_FILE" ] || ! grep -Eq '^DEMO_MODE=1$' "$DEMO_ENV_FILE"; then
        echo "отказ: в $DEMO_ENV_FILE нет DEMO_MODE=1 — это не окружение демо." >&2
        echo "Шаблон: deploy/demo/.env.example." >&2
        exit 1
    fi
}
