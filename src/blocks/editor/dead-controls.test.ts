// Сторож на класс дефекта: намертво выключенный элемент управления в разметке.
//
// Предыстория не гипотетическая: в продукте трижды подряд находили нарисованную серую
// кнопку или пункт, у которых нет способа стать активными. Пользователь видит серый
// элемент и решает, что дело в его правах, а не в недоделке блока. Ближайший случай —
// T107 (`docs/furca/blocks/catalog.md`): кнопки «QR» простояли `disabled` месяц после
// того, как причина отключения (блок `qr` ещё не существовал) истекла, — и это заметили
// только вручную, потому что написать на них тест никто не вспомнил. Блок `library` при
// сдаче отловил и починил такой же `<span aria-disabled>` в четырёх копиях навигации
// (`docs/furca/blocks/library.md`), но прямо признал, что не тронул
// `editor/ui/SectionCard.tsx` — форма адреса библиотеки была за пределами его прав.
//
// Поведенческий тест такую находку не ловит: он проверяет то, про что вспомнили при
// написании, а на новом экране про неё ещё не вспомнили. Здесь — структурная проверка
// приёма из `core/admin-links.test.ts` (T088): ловится САМО ПОЯВЛЕНИЕ дефекта в
// разметке, а не конкретный случай. Снятие комментариев — общий помощник
// `core/source-text`, третьей копии приёма у нас нет (T128).
//
// Охват — только `src/blocks/editor/ui`, а не весь кабинет:
//   * соседние блоки (`catalog`, `qr`, `feed`, …) строятся параллельно этому, и такой же
//     сторож для них — отдельная задача, когда соседи сойдутся;
//   * в `src/blocks/catalog/ui/StoreCard.tsx` есть намеренно выключенный `<select>` со
//     страной пиццерии — поле только для чтения (перенос между странами эта версия не
//     делает), а не обещанное действие, за которым ничего нет. Чтобы не ловить его,
//     сторожу пришлось бы отдельно учиться отличать «поле не редактируется никогда по
//     правилам продукта» от «кнопка не работает, потому что для неё ничего не готово», —
//     это расширение охвата, а не эта задача.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { repositoryRoot } from "@/blocks/core/repo-copy";
import { withoutComments } from "@/blocks/core/source-text";

/** Где ищем: разметка кабинета редактора, не весь продукт (см. комментарий выше). */
const ROOT = "src/blocks/editor/ui";

type DeadControlKind = "disabled" | "aria-disabled";

interface DeadControl {
  readonly kind: DeadControlKind;
  readonly snippet: string;
}

/**
 * `disabled` без выражения — постоянный: `<button disabled>` не станет активным никогда,
 * в отличие от `disabled={saving}`, где выключение снимается сменой состояния. Разбор
 * не должен сработать на двух законных соседях по написанию:
 *   * `disabled={…}` — сразу после слова идёт `=`, выключение обратимо;
 *   * `disabled:cursor-not-allowed` — сразу после слова идёт `:`, это класс Tailwind на
 *     псевдокласс браузера (стиль), а не атрибут JSX.
 * Поэтому нарушение — только слово `disabled`, за которым (не считая пробелов) не следует
 * ни `=`, ни `:`.
 */
const BARE_DISABLED = /\bdisabled\b(?!\s*[:=])/g;

/** `aria-disabled="true"` литералом — тот же дефект под другим атрибутом. */
const ARIA_DISABLED_TRUE = /aria-disabled=["']true["']/g;

/**
 * Разбор одной строки на нарушения. Вынесен отдельно от обхода файлов и проверен ниже
 * прямо на строках-образцах: без этого сторож мог бы оказаться пустым (совпадений не
 * находит никогда) или слепым (совпадает с чем попало) и оставаться зелёным всегда —
 * ровно то, от чего защищает вторая проверка в `describe` ниже.
 */
function findDeadControls(line: string): DeadControl[] {
  const found: DeadControl[] = [];
  for (const match of line.matchAll(BARE_DISABLED)) {
    found.push({ kind: "disabled", snippet: match[0] });
  }
  for (const match of line.matchAll(ARIA_DISABLED_TRUE)) {
    found.push({ kind: "aria-disabled", snippet: match[0] });
  }
  return found;
}

function tsxFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...tsxFiles(full));
    else if (entry.name.endsWith(".tsx")) found.push(full);
  }
  return found;
}

function deadControlOffenders(): string[] {
  const root = repositoryRoot();
  const offenders: string[] = [];

  for (const file of tsxFiles(path.join(root, ROOT))) {
    // Комментарии снимает общий помощник `core/source-text`: иначе сторож ловил бы
    // объяснения в самой разметке — в `ui/PreviewScreen.tsx` словами рассказано, что
    // футер был `<button disabled>`. Помощник бланкует блочные комментарии, а не
    // выбрасывает строки, и это здесь обязательно: офендер печатается с номером строки.
    const lines = withoutComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, index) => {
      for (const control of findDeadControls(line)) {
        offenders.push(
          `${path.relative(root, file)}:${String(index + 1)} (${control.kind}): ${line.trim()}`,
        );
      }
    });
  }

  return offenders;
}

describe("намертво выключенные элементы управления в разметке редактора", () => {
  test('в разметке нет постоянного disabled и постоянного aria-disabled="true"', () => {
    expect(deadControlOffenders()).toEqual([]);
  });

  test("сторож видит саму разметку, а не пустоту", () => {
    // Без этой проверки предыдущая была бы зелёной и при сломанном обходе файлов.
    const root = repositoryRoot();
    const files = tsxFiles(path.join(root, ROOT));

    expect(files.length).toBeGreaterThan(10);
    expect(
      files.some((file) => file.endsWith(path.join("ui", "SectionCard.tsx"))),
    ).toBe(true);
  });

  describe("разбор строки — доказательство, что сторож не слепой", () => {
    test("ловит постоянный disabled без выражения", () => {
      // Настоящая строка футера предпросмотра, какой она была до T115.
      const line =
        '<button type="button" disabled className={FOOTER_BUTTON_CLASS}>';

      expect(findDeadControls(line)).toEqual([
        { kind: "disabled", snippet: "disabled" },
      ]);
    });

    test('ловит постоянный aria-disabled="true"', () => {
      // Пункт «Открыть блок» вставленной секции, каким он был до T115.
      const line = '              aria-disabled="true"';

      expect(findDeadControls(line)).toEqual([
        { kind: "aria-disabled", snippet: 'aria-disabled="true"' },
      ]);
    });

    test("не ловит disabled={состояние} — выключение обратимо", () => {
      // ChecklistEditor.tsx:213 и SidePanels.tsx:122 — оба законны: выключение снимается
      // сменой состояния (`saving`, `inserted`), а не остаётся навсегда.
      expect(findDeadControls("              disabled={saving}")).toEqual([]);
      expect(findDeadControls("                  disabled={inserted}")).toEqual(
        [],
      );
    });

    test("не ловит класс Tailwind disabled:* — это стиль, а не атрибут", () => {
      // Класс футера предпросмотра до T115: применяется браузерным псевдоклассом,
      // а не задаёт атрибут элемента.
      const line =
        '  "h-[52px] w-full rounded-[var(--r-block)] border border-[var(--accent)] bg-accent text-[length:var(--fs-title)] font-medium text-[var(--ink-inverse)] opacity-45 disabled:cursor-not-allowed";';

      expect(findDeadControls(line)).toEqual([]);
    });
  });
});
