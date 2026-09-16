// Журнал табличного пункта: строки заводит сотрудник, колонки задал методист (D074).
//
// Правила чистые и лежат в одном месте, потому что считают по ним двое: браузер между
// касаниями (кнопка «строка», прогресс, отправка) и сервер при разборе тела запроса.
// Два свода одних и тех же правил разъезжаются молча — и расходятся в сторону
// «экран разрешил, сервер отверг», то есть потерянной работы сотрудника.
//
// Ввоз только типов: файл уезжает в браузер вместе с формой заполнения, а вход блока
// `data` тянет за собой драйвер `pg`, которого там нет (тот же приём, что в `answers.ts`).
import type { TableRow } from "@/blocks/data/types";

/**
 * Пределы журнала. Числа — заслон от мусора, а не рабочая мерка: в исходных вкладках
 * `Dough mixing` замесов за смену четырнадцать, клетка это «24,5», «18:20» или
 * «медленно 4 мин», а не докладная.
 */
export const TABLE_LIMITS = {
  rows: 50,
  cellLength: 100,
  /** Опознаватель колонки — тот же uuid, что у пункта; предел такой же, как у него. */
  columnIdLength: 128,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * «Добавить строку». На пределе список возвращается прежним, а не обрезается: кнопка
 * к этому моменту уже погашена, и молча подменять действие бездействием незачем.
 */
export function addRow(rows: readonly TableRow[]): TableRow[] {
  if (rows.length >= TABLE_LIMITS.rows) return [...rows];
  return [...rows, {}];
}

/**
 * Клетка по опознавателю КОЛОНКИ, а не по её месту: место меняется правкой колонок,
 * опознаватель — нет. Текст кладётся как есть, без обрезки крайних пробелов:
 * сотрудник ещё печатает, и пробел под пальцем не должен исчезать на каждом знаке.
 */
export function setCell(
  rows: readonly TableRow[],
  index: number,
  columnId: string,
  text: string,
): TableRow[] {
  return rows.map((row, at) =>
    at === index ? { ...row, [columnId]: text } : { ...row },
  );
}

export function removeRow(
  rows: readonly TableRow[],
  index: number,
): TableRow[] {
  return rows.filter((_, at) => at !== index);
}

/** В клетке есть ответ, а не одни пробелы. */
function hasText(value: string): boolean {
  return value.trim() !== "";
}

/**
 * Журнал в том виде, в каком он уходит на сервер: пустые строки отброшены, крайние
 * пробелы срезаны, пустая клетка не хранится вовсе. Пустая клетка и отсутствующая —
 * одно состояние, и записывается оно одним способом.
 */
export function filledRows(rows: readonly TableRow[]): TableRow[] {
  const filled: TableRow[] = [];
  for (const row of rows) {
    const cells: TableRow = {};
    for (const [columnId, value] of Object.entries(row)) {
      if (hasText(value)) cells[columnId] = value.trim();
    }
    if (Object.keys(cells).length > 0) filled.push(cells);
  }
  return filled;
}

/**
 * Журнал из тела запроса. Возвращает нормализованные строки или `null` — форма не та.
 *
 * Отказ, а не приведение: число в клетке значит, что тело собрал не наш экран, и
 * молча превратить его в текст — то же самое, что принять чужую форму за свою.
 */
export function parseTableRows(input: unknown): TableRow[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length > TABLE_LIMITS.rows) return null;

  const rows: TableRow[] = [];
  for (const raw of input) {
    if (!isRecord(raw)) return null;
    const row: TableRow = {};
    for (const [columnId, value] of Object.entries(raw)) {
      if (columnId.length > TABLE_LIMITS.columnIdLength) return null;
      if (typeof value !== "string") return null;
      if (value.length > TABLE_LIMITS.cellLength) return null;
      row[columnId] = value;
    }
    rows.push(row);
  }
  return filledRows(rows);
}
