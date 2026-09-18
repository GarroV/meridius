/**
 * Измерители полосы фактов карточки заполнения: сколько ячеек, где они стоят, не
 * обрезана ли подпись, не висит ли граница в пустоте. Живут отдельно от сценариев
 * (`feed.spec.ts`) и отдельно от заготовки данных (`feed-fixtures.ts`), потому что
 * это третья вещь: не данные и не сценарий, а разбор того, что нарисовано.
 *
 * С `submission-phone.spec.ts` общего у них нет — там своя геометрия, метки шапки и
 * сетка ответов.
 */

import { expect, type Page } from "@playwright/test";

/** Ячеек в полосе фактов карточки пять: четыре с эталона и режим смены (D055). */
export const FACT_COUNT = 5;

/** Ячейка полосы фактов: где стоит и есть ли у неё левая граница. */
export interface FactCell {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly borderLeft: number;
  /** Насколько содержимое ячейки шире самой ячейки: 0 — влезло целиком. */
  readonly overflow: number;
  readonly text: string;
}

/** Ряд полосы фактов: края ряда и сколько ячеек в него легло. */
export interface FactRow {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly count: number;
}

/**
 * Ячейки полосы фактов, снятые из НАСТОЯЩЕЙ раскладки браузера, а не из классов
 * разметки: класс меняют, не починив вид, и чинят вид, не тронув класс, — про экран
 * говорит только геометрия. Левая граница снимается вместе с коробкой: именно она
 * и оставалась висеть в пустоте, когда ячейка переносилась в новый ряд.
 */
export async function factCells(page: Page): Promise<readonly FactCell[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="submission-fact"]')].map(
      (cell) => {
        const box = cell.getBoundingClientRect();
        return {
          top: Math.round(box.top),
          left: Math.round(box.left),
          right: Math.round(box.right),
          borderLeft: Number.parseFloat(
            globalThis.getComputedStyle(cell).borderLeftWidth,
          ),
          overflow: Math.max(
            0,
            ...[...cell.children].map(
              (line) => line.scrollWidth - line.clientWidth,
            ),
          ),
          text: cell.textContent.replaceAll(/\s+/gu, " ").trim(),
        };
      },
    ),
  );
}

/** Ячейки, сгруппированные в ряды по верхней кромке. */
export function factRows(cells: readonly FactCell[]): readonly FactRow[] {
  const rows = new Map<number, FactRow>();

  for (const cell of cells) {
    const known = rows.get(cell.top);
    rows.set(
      cell.top,
      known === undefined
        ? { top: cell.top, left: cell.left, right: cell.right, count: 1 }
        : {
            top: cell.top,
            left: Math.min(known.left, cell.left),
            right: Math.max(known.right, cell.right),
            count: known.count + 1,
          },
    );
  }

  return [...rows.values()].sort((a, b) => a.top - b.top);
}

/**
 * Каждый ряд полосы доходит до обоих краёв карточки. Это и есть проверяемое свойство
 * раскладки: ячейка, стоящая в ряду одна шириной в долю ряда, обрывает его правый край —
 * ровно так выглядел дефект T171.
 */
export function assertRowsFillWidth(rows: readonly FactRow[]): void {
  const left = Math.min(...rows.map((row) => row.left));
  const right = Math.max(...rows.map((row) => row.right));

  for (const row of rows) {
    expect(
      row.left,
      "Ряд полосы фактов начинается не от края карточки.",
    ).toBeLessThanOrEqual(left + 1);
    expect(
      row.right,
      "Ряд полосы фактов обрывается, не дойдя до края карточки: ячейка стоит в нём " +
        "одна, шириной в долю ряда, — это и есть дефект T171.",
    ).toBeGreaterThanOrEqual(right - 1);
  }
}

/**
 * Вторая половина того же дефекта: ячейка, открывающая ряд, не несёт левой границы.
 * Разделитель между соседями — это линия МЕЖДУ ними; в начале ряда он упирается в
 * пустоту и читается как обрезанная таблица. Геометрией это не ловится: ряд при этом
 * может быть полным.
 */
export function assertNoDanglingBorder(cells: readonly FactCell[]): void {
  const leftEdge = Math.min(...cells.map((cell) => cell.left));

  for (const cell of cells.filter((cell) => cell.left <= leftEdge + 1)) {
    expect(
      cell.borderLeft,
      "У ячейки, открывающей ряд полосы фактов, есть левая граница: разделять ей " +
        "нечего, и она висит в пустоте (дефект T171).",
    ).toBe(0);
  }
}

/**
 * Третья половина того же дефекта, найденная сверкой с эталоном: ячейка укладывается в
 * ряд, а её подпись в ячейку — нет. Карточка обрезает переполнение (`overflow-hidden`
 * ради скруглённых углов), поэтому обрезка НЕ видна ни в ширине страницы, ни в
 * геометрии рядов: «отправлено» просто становится «отправл». Проверяется прямо:
 * содержимое ячейки не шире самой ячейки.
 */
export function assertNoClippedText(cells: readonly FactCell[]): void {
  for (const cell of cells) {
    expect(
      cell.overflow,
      `Подпись факта не влезает в свою ячейку и обрезается: «${cell.text}». ` +
        "Полоса выглядит целой, а слова в ней потеряны.",
    ).toBe(0);
  }
}
