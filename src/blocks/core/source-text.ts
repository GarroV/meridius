// Общий приём для сторожей, которые читают исходный текст продукта: снять комментарии,
// прежде чем что-то в нём искать. Без этого сторож ловит собственное объяснение — правило
// про мёртвые элементы, про якоря и про ключи словаря объясняется словами в тех же файлах,
// где и стережётся.
//
// Появился третьим разом. Приём был написан в `core/admin-links.test.ts` (T088), скопирован
// в `editor/dead-controls.test.ts` (T115) и понадобился снова сторожу ключей (T123) —
// то есть это не совпадение, а общий инструмент. Копия номер три не заводится: сведено сюда.
//
// **Почему здесь разбор по знакам, а не два регулярных выражения (T156).** Прежняя версия
// бланковала всё между `/*` и ближайшим `*/` и выбрасывала строки, начинающиеся с `//`.
// На живом коде это давало дыру, а не приблизительный ответ: `*` в пути внутри комментария
// (`docs/furca/design/screens/*.html`) или в строке (`"/admin/*"`) открывал МНИМЫЙ блочный
// комментарий, который тянулся до ближайшего настоящего `*/` — и сторож переставал видеть
// код между ними. В `core/ui/AdminShell.tsx` так пропадало семнадцать строк, включая весь
// список пропов; в `src/security-headers.ts` и `src/blocks/auth/actions.ts` — соседние с
// ними строки. То есть три сторожа подряд смотрели в дырявый текст и молчали не потому,
// что нарушений нет, а потому, что нарушения им не показали. Проверено порчей: зашитый
// адрес раздела, положенный в такую слепую зону, не поймал ни один сторож.

/** Что сейчас разбирается: обычный код или один из участков, где комментариев не бывает. */
type Mode = "code" | "line" | "block" | "string" | "regex";

/** Знаки, после которых `/` начинает регулярное выражение, а не деление. */
const BEFORE_REGEX = new Set([
  "",
  "(",
  ",",
  "=",
  ":",
  "[",
  "!",
  "&",
  "|",
  "?",
  "{",
  "}",
  ";",
  "+",
  "-",
  "*",
  "%",
  "~",
  "^",
  "<",
  ">",
  "\n",
]);

/**
 * Текст без комментариев, с сохранением нумерации строк и колонок.
 *
 * Комментарии заменяются пробелами, а не выбрасываются: сторож, печатающий номер строки,
 * иначе называл бы не ту. Всё остальное — строковые и шаблонные литералы, регулярные
 * выражения — доходит до сторожа дословно: именно в них он и ищет.
 *
 * Чего разбор не делает: не понимает `${…}` внутри шаблонной строки (её содержимое целиком
 * считается строкой) и не разбирает JSX-текст. Для поиска по исходному тексту этого
 * достаточно, а полноценный разбор стоил бы зависимости от разборщика TypeScript.
 */
export function withoutComments(source: string): string {
  const out: string[] = [];
  let mode: Mode = "code";
  /** Кавычка, которой открыт литерал, либо `undefined` вне литерала. */
  let quote: string | undefined;
  /** Последний значащий знак кода: по нему `/` отличается от деления. */
  let previous = "";
  /** Внутри `[…]` регулярного выражения `/` не закрывает его. */
  let inCharacterClass = false;
  let index = 0;

  const keep = (character: string): void => {
    out.push(character);
    if (!/\s/.test(character)) previous = character;
  };
  const blank = (character: string): void => {
    out.push(character === "\n" ? "\n" : " ");
  };

  while (index < source.length) {
    const character = source[index] ?? "";
    const next = source[index + 1];

    if (mode === "line") {
      if (character === "\n") mode = "code";
      blank(character);
      index += 1;
      continue;
    }

    if (mode === "block") {
      if (character === "*" && next === "/") {
        out.push("  ");
        index += 2;
        mode = "code";
        continue;
      }
      blank(character);
      index += 1;
      continue;
    }

    if (mode === "string") {
      keep(character);
      index += 1;
      if (character === "\\") {
        // Экранирование: следующий знак не закрывает литерал, чем бы он ни был.
        if (next !== undefined) keep(next);
        index += 1;
        continue;
      }
      if (character === quote) mode = "code";
      // Незакрытая кавычка не тянется на следующую строку: так ошибка в одном месте
      // не ослепляет сторожа до конца файла (в шаблонной строке перенос законен).
      else if (character === "\n" && quote !== "`") mode = "code";
      continue;
    }

    if (mode === "regex") {
      keep(character);
      index += 1;
      if (character === "\\") {
        if (next !== undefined) keep(next);
        index += 1;
        continue;
      }
      if (character === "[") inCharacterClass = true;
      else if (character === "]") inCharacterClass = false;
      else if (character === "/" && !inCharacterClass) mode = "code";
      else if (character === "\n") mode = "code";
      continue;
    }

    if (character === "/" && next === "/") {
      mode = "line";
      continue;
    }
    if (character === "/" && next === "*") {
      mode = "block";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      mode = "string";
      keep(character);
      index += 1;
      continue;
    }
    if (character === "/" && BEFORE_REGEX.has(previous)) {
      // Регулярное выражение: внутри него живут и `//`, и кавычки, и `/*` — комментариями
      // они не являются, а кавычка оттуда сбила бы разбор на весь остаток файла.
      mode = "regex";
      inCharacterClass = false;
      keep(character);
      index += 1;
      continue;
    }

    keep(character);
    index += 1;
  }

  return out.join("");
}
