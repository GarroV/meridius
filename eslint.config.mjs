// @ts-check
import eslintReact from "@eslint-react/eslint-plugin";
import depend from "eslint-plugin-depend";
import importX from "eslint-plugin-import-x";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // 1. Игнор — сборка, зависимости, машинные отчёты и чужой эталон дизайн-системы в docs/.
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "reports/**",
      "coverage/**",
      "next-env.d.ts",
      "docs/**",
      // Worker фронта Cloudflare: другой рантайм, свой выклад через wrangler.
      "front/**",
    ],
  },

  // 2. Базовый набор для TypeScript: строгие тип-зависимые пресеты typescript-eslint.
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      sonarjs,
      unicorn,
      "@eslint-react": eslintReact,
      "import-x": importX,
      depend,
    },
    rules: {
      // --- sonarjs: точечно, не recommended целиком ---
      // Одинаковая логика в двух функциях — сигнал вынести общую (актуально для обработчиков локали/JSON-словарей).
      "sonarjs/no-identical-functions": "error",
      // Один и тот же строковый литерал в нескольких местах — источник рассинхрона (ключи словаря, css-классы).
      "sonarjs/no-duplicate-string": "error",
      // Вложенные if, которые можно слить в один — усложняют чтение серверных компонентов.
      "sonarjs/no-collapsible-if": "error",
      // `=== true` / `=== false` вместо самого булевого значения.
      "sonarjs/no-redundant-boolean": "error",
      // Промежуточная переменная перед немедленным return/throw — лишний шаг чтения.
      "sonarjs/prefer-immediate-return": "error",
      // Игнорируется результат чистой функции (например, `pickLocale(...)` без использования) — почти всегда баг.
      "sonarjs/no-ignored-return": "error",

      // --- unicorn: точечно ---
      // Импорт встроенных модулей Node только через префикс `node:` — так уже написано в vitest.config.ts.
      "unicorn/prefer-node-protocol": "error",
      // `.indexOf(x) !== -1` вместо `.includes(x)` — в проекте уже принят `.includes()` (см. locale.ts).
      "unicorn/prefer-includes": "error",
      // `x instanceof Array` вместо надёжного `Array.isArray(x)` (не проходит через границы realm/iframe).
      "unicorn/no-instanceof-array": "error",
      // Явный `undefined` там, где достаточно отсутствия аргумента/значения.
      "unicorn/no-useless-undefined": "error",
      // Функция не использует замыкание, но объявлена внутри другой — не вынесена на верхний уровень модуля.
      "unicorn/consistent-function-scoping": "error",
      // `new Error()` без сообщения — в логах сервера бесполезная запись.
      "unicorn/error-message": "error",

      // --- @eslint-react: правила, не требующие ручной настройки версии React ---
      // Индекс массива как React key — ломает сверку при переупорядочивании списка.
      "@eslint-react/no-array-index-key": "error",
      // `{value && <Jsx/>}` рендерит `0`/`NaN`/пустую строку вместо ничего — частый баг в серверных компонентах.
      "@eslint-react/no-leaked-conditional-rendering": "error",
      // React 19: `<Context>` вместо `<Context.Provider>`.
      "@eslint-react/no-context-provider": "error",
      // Лишний `<>...</>` вокруг одного узла.
      "@eslint-react/jsx-no-useless-fragment": "error",
      // Компонент, объявленный внутри другого компонента, — пересоздаётся на каждый рендер.
      "@eslint-react/no-nested-component-definitions": "error",
      // Элемент списка без `key`.
      "@eslint-react/no-missing-key": "error",

      // --- import-x: точечно, обязателен порядок импортов ---
      // Порядок: сначала внешние пакеты, затем свои через "@/", группы разделены пустой строкой (уже так в src/).
      // Без `alphabetize`: контракт требует только порядок групп и пустую строку между ними, не сортировку внутри группы.
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
          ],
          pathGroups: [
            { pattern: "@/**", group: "internal", position: "before" },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          "newlines-between": "always",
        },
      ],
      // Два отдельных `import` из одного модуля — слить в один.
      "import-x/no-duplicates": "error",
      // Пустая строка после блока импортов.
      "import-x/newline-after-import": "error",
      // Импорты должны идти раньше остального кода модуля.
      "import-x/first": "error",
      // `export let`/`export var` — экспортируемое значение должно быть неизменяемым (см. правило проекта об иммутабельности).
      "import-x/no-mutable-exports": "error",

      // --- depend: у плагина всего одно правило, оно и есть точечный набор ---
      // Пакет из чёрного списка (устаревшие полифиллы вроде lodash.isarray, moment и т.п.) — заменить нативным API.
      "depend/ban-dependencies": "error",
    },
  },

  // 3. Тесты и e2e-сценарии: тип-зависимые правила остаются, но литературные/численные послабления для читаемости тестовых данных.
  {
    files: ["src/**/*.test.ts", "e2e/**/*.ts"],
    rules: {
      // В тестах один и тот же литерал (заголовок Accept-Language, текст ожидания) законно повторяется по кейсам.
      "sonarjs/no-duplicate-string": "off",
      // Тестовые сценарии часто структурно похожи (arrange/act/assert) — это не дублирование логики продукта.
      "sonarjs/no-identical-functions": "off",
    },
  },

  // 4. Конфиги сборки на голом JS: без типовой информации TypeScript.
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // 5. Форматирование — забота Prettier, а не ESLint (последним элементом отключает стилистику).
  eslintConfigPrettier,
);
