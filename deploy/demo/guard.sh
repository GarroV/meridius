# Общая сверка для update.sh и reset.sh: работать можно только в дереве демо.
# Подключается через `source` после `cd` в корень дерева; сам ничего не запускает.
#
# Скрипты берут deploy/.env из того дерева, где лежат. Запущенные из боевого
# (/srv/meridius/deploy/demo/reset.sh), они снесли бы том, а update.sh собрал бы демо
# с боевыми секретами — урок decimus #1246. Пускаем, если дерево — /srv/meridius-demo
# ИЛИ в deploy/.env стоит DEMO_STAND=1 (у боевого дерева его нет). Значения не печатаются.
DEMO_TREE=${MERIDIUS_DEMO_TREE:-/srv/meridius-demo}

require_demo_tree() {
    local here
    here=$(pwd -P)
    if [ "$here" = "$DEMO_TREE" ]; then
        return 0
    fi
    if [ -f deploy/.env ] && grep -Eq '^DEMO_STAND=1$' deploy/.env; then
        return 0
    fi
    echo "отказ: $here — не дерево демо ($DEMO_TREE), и в deploy/.env нет DEMO_STAND=1." >&2
    echo "Демо собралось бы с боевым окружением. Запускать из $DEMO_TREE." >&2
    exit 1
}
