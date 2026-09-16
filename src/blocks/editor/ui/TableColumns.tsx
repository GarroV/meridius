import { useTranslations } from "next-intl";
import type { ChangeEvent } from "react";

import type { Item } from "@/blocks/data";

import { MAX_COLUMNS } from "../table-field";

/**
 * Колонки табличного пункта под его строкой в редакторе (D074).
 *
 * Отдельной панелью, а не окном за чипом: колонок у журнала замеса восемь-десять, и
 * методист заводит их подряд, глядя на бумажный лист. Окно пришлось бы открывать и
 * закрывать на каждую строку — это ровно та лишняя минута, ради которой редактор и
 * делался (принцип «чек-лист из двадцати пунктов заводится за минуты»).
 *
 * Норма — своё поле рядом с названием: в бумажном журнале она стоит строкой над
 * шапкой («16–26 °C», «200 г», «медленно — 4 мин»), и вписать её в название значит
 * слепить подпись колонки с требованием к ней.
 */
export interface TableColumnsProps {
  readonly item: Item;
  readonly locale: string;
  readonly onAdd: () => void;
  readonly onTitle: (columnId: string, text: string) => void;
  readonly onNorm: (columnId: string, text: string) => void;
  readonly onRemove: (columnId: string) => void;
}

/** Опознаватель поля названия: по нему экран переводит курсор в новую колонку. */
export function columnInputId(columnId: string): string {
  return `column-title-${columnId}`;
}

const PANEL_CLASS =
  "flex flex-col gap-[var(--space-3)] border-b border-[var(--line)] py-[var(--space-4)] pr-[var(--space-6)] pl-[calc(28px+var(--space-5)+var(--space-6))]";
const LABEL_CLASS =
  "text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const INPUT_CLASS =
  "text-ink bg-surface h-[var(--control-h-sm)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-4)] text-[length:var(--fs-dense)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const ADD_CLASS =
  "text-ink bg-surface h-[var(--control-h-sm)] cursor-pointer rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-dense)] hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-45";
const REMOVE_CLASS =
  "text-err flex h-[var(--control-h-sm)] w-[var(--control-h-sm)] cursor-pointer items-center justify-center rounded-[var(--r-control)] border border-transparent bg-transparent hover:border-[var(--err-line)] hover:bg-[var(--err-soft)]";

export function TableColumns({
  item,
  locale,
  onAdd,
  onTitle,
  onNorm,
  onRemove,
}: TableColumnsProps) {
  const t = useTranslations("editor.table");
  const columns = item.columns ?? [];
  const full = columns.length >= MAX_COLUMNS;

  return (
    <div data-testid="item-columns" className={PANEL_CLASS}>
      <span className={LABEL_CLASS}>{t("columns")}</span>

      {columns.length === 0 ? (
        <span className="text-[length:var(--fs-meta)] text-[var(--ink-3)]">
          {t("empty")}
        </span>
      ) : null}

      {columns.map((column, index) => (
        <div
          key={column.id}
          data-testid="item-column"
          className="flex items-center gap-[var(--space-4)]"
        >
          <input
            id={columnInputId(column.id)}
            data-testid="column-title"
            className={`${INPUT_CLASS} w-[220px]`}
            value={column.title[locale] ?? ""}
            placeholder={t("columnTitlePlaceholder")}
            aria-label={`${t("columnTitle")} ${String(index + 1)}`}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              onTitle(column.id, event.target.value);
            }}
          />
          <input
            data-testid="column-norm"
            className={`${INPUT_CLASS} w-[160px]`}
            value={column.norm?.[locale] ?? ""}
            placeholder={t("normPlaceholder")}
            aria-label={`${t("norm")} ${String(index + 1)}`}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              onNorm(column.id, event.target.value);
            }}
          />
          <button
            type="button"
            data-testid="column-remove"
            aria-label={t("removeColumn")}
            className={REMOVE_CLASS}
            onClick={() => {
              onRemove(column.id);
            }}
          >
            ×
          </button>
        </div>
      ))}

      <div className="flex items-center gap-[var(--space-5)]">
        <button
          type="button"
          data-testid="column-add"
          className={ADD_CLASS}
          disabled={full}
          title={full ? t("limit", { count: MAX_COLUMNS }) : undefined}
          onClick={onAdd}
        >
          + {t("addColumn")}
        </button>
        <span className="text-[length:var(--fs-meta)] text-[var(--ink-3)]">
          {t("hint")}
        </span>
      </div>
    </div>
  );
}
