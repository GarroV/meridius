import { useTranslations } from "next-intl";
import { useState } from "react";

import type { TableRow } from "@/blocks/data";

import type { FillColumnView, FillItemView } from "../model";
import { addRow, removeRow, setCell, TABLE_LIMITS } from "../table-journal";

/**
 * Журнал табличного пункта на экране сотрудника (D074): колонки задал методист,
 * строки заводит сотрудник по ходу смены.
 *
 * СТРОКА — КАРТОЧКА, А НЕ СТРОКА ТАБЛИЦЫ, и это главное решение экрана. Бумажный
 * журнал замеса — это восемь-десять колонок; на телефоне в 375 точек такая таблица
 * помещается только горизонтальной прокруткой, а её продукт себе не позволяет:
 * сотрудник стоит у тестомеса и заполняет одной рукой, и уехавшая вбок колонка — это
 * незаполненная колонка. Поэтому каждая строка журнала разворачивается в карточку с
 * полями сверху вниз, а норма стоит прямо у своего поля — то есть ближе к глазам, чем
 * на бумаге, где она живёт одной строкой над всей шапкой.
 *
 * Цена решения названа честно: сравнить два замеса между собой на этом экране нельзя.
 * Сравнение — работа управляющего, и оно есть там, где для него есть ширина: карточка
 * заполнения в ленте показывает журнал настоящей таблицей.
 */
export interface TableJournalProps {
  readonly item: FillItemView;
  readonly rows: readonly TableRow[];
  readonly onChange: (rows: TableRow[]) => void;
}

const HINT_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const LABEL_CLASS =
  "text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const INPUT_CLASS =
  "text-ink bg-surface h-[var(--tap-min)] w-full rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-lead)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const ADD_CLASS =
  "text-ink bg-surface h-[var(--tap-min)] w-full rounded-[var(--r-block)] border border-[var(--line-strong)] text-[length:var(--fs-lead)] font-medium disabled:cursor-not-allowed disabled:opacity-45";
const REMOVE_CLASS =
  "text-err flex h-[var(--tap-min)] w-[var(--tap-min)] items-center justify-center rounded-[var(--r-control)] border border-transparent bg-transparent text-[length:var(--fs-title)]";

/** Свой опознаватель строки: в самой строке его нет, а React о порядке спрашивает. */
function newKeys(count: number): string[] {
  return Array.from({ length: count }, () => crypto.randomUUID());
}

export function TableJournal({ item, rows, onChange }: TableJournalProps) {
  const t = useTranslations("fill.table");
  const columns: readonly FillColumnView[] = item.columns ?? [];
  // Опознаватели строк живут здесь, а не в ответе: в базу уезжает то, что вписал
  // сотрудник, и ни одного поля сверх. Удаление средней строки без них перебрасывало
  // бы курсор в чужое поле — React считал бы строку той же по её месту в списке.
  const [keys, setKeys] = useState<string[]>(() => newKeys(rows.length));
  const rowKeys = keys.length === rows.length ? keys : newKeys(rows.length);

  const full = rows.length >= TABLE_LIMITS.rows;

  function change(next: TableRow[], nextKeys: string[]): void {
    setKeys(nextKeys);
    onChange(next);
  }

  return (
    <div
      data-testid="fill-table"
      data-item-id={item.id}
      className="mx-[var(--space-7)] mb-[var(--space-6)] flex flex-col gap-[var(--space-5)]"
    >
      {columns.length === 0 ? (
        <span className={HINT_CLASS}>{t("noColumns")}</span>
      ) : null}

      {columns.length > 0 && rows.length === 0 ? (
        <span className={HINT_CLASS}>{t("empty")}</span>
      ) : null}

      {rows.map((row, index) => (
        <div
          key={rowKeys[index]}
          data-testid="fill-table-row"
          className="rounded-[var(--r-block)] border border-[var(--line)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--line)] pl-[var(--space-5)]">
            <span className={LABEL_CLASS}>
              {t("row", { number: index + 1 })}
            </span>
            <button
              type="button"
              data-testid="fill-table-remove"
              aria-label={t("removeRow", { number: index + 1 })}
              className={REMOVE_CLASS}
              onClick={() => {
                change(
                  removeRow(rows, index),
                  rowKeys.filter((_, at) => at !== index),
                );
              }}
            >
              ×
            </button>
          </div>

          <div className="flex flex-col gap-[var(--space-4)] p-[var(--space-5)]">
            {columns.map((column) => (
              <label
                key={column.id}
                className="flex flex-col gap-[var(--space-2)]"
              >
                <span className={LABEL_CLASS}>
                  {column.title}
                  {column.norm === null ? null : (
                    <span className="ml-[var(--space-3)] font-normal text-[var(--ink-3)] normal-case">
                      {column.norm}
                    </span>
                  )}
                </span>
                <input
                  data-testid="fill-table-cell"
                  data-column-id={column.id}
                  className={INPUT_CLASS}
                  value={row[column.id] ?? ""}
                  onChange={(event) => {
                    change(
                      setCell(rows, index, column.id, event.target.value),
                      [...rowKeys],
                    );
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      {columns.length === 0 ? null : (
        <button
          type="button"
          data-testid="fill-table-add"
          className={ADD_CLASS}
          disabled={full}
          onClick={() => {
            change(addRow(rows), [...rowKeys, crypto.randomUUID()]);
          }}
        >
          {full ? t("limit", { count: TABLE_LIMITS.rows }) : `+ ${t("addRow")}`}
        </button>
      )}
    </div>
  );
}
