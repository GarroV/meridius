import { useTranslations } from "next-intl";
import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from "react";

import type { ChecklistWindow, Item, ItemType, Severity } from "@/blocks/data";
// `severityOf` берётся напрямую из модуля уровней, а НЕ из входа `@/blocks/data`:
// эта строка попадает в клиентскую сборку (её рисует клиентский `ChecklistEditor`),
// а вход блока data тянет за собой пул подключений и драйвер `pg`, которого в браузере
// нет — сборка админки падала на `module-not-found`. Модуль уровней чистый: ни базы,
// ни узловых зависимостей.
import { severityOf } from "@/blocks/data/severity";

import type { ScheduleSetting } from "../editing";
import { pickEditorText } from "../localized-text";
import { ScheduleChip } from "./ScheduleChip";
import { SELECT_ARROW_SMALL } from "./select-style";
import { TableColumns } from "./TableColumns";

/** Строка пункта в редакторе по эталону `docs/furca/design/screens/editor.html`. */
export interface ItemRowProps {
  readonly item: Item;
  /** Сквозной номер по всему чек-листу: в эталоне нумерация не начинается заново в секции. */
  readonly ordinal: number;
  readonly locale: string;
  /**
   * Управление регулярностью — целиком или никак (T137).
   *
   * Необязательно, потому что ту же строку рисует правка блока библиотеки, а у блока
   * нет и не может быть окна чек-листа: блок живёт сразу в нескольких чек-листах с
   * разными окнами, и от какого из них считать первый отрезок — вопрос без ответа.
   * Одним полем, а не четырьмя необязательными: половина управления, приехавшая без
   * второй половины, — это чип, который открывается и ничего не применяет.
   */
  readonly schedule?: {
    /** Окно чек-листа: от него считается первый отрезок обхода (`schedule-field.ts`). */
    readonly window: ChecklistWindow;
    /** Экран ожил: признак спускается сверху, а не считается в каждой из сотни строк. */
    readonly live: boolean;
    readonly onApply: (setting: ScheduleSetting) => void;
    readonly onApplyToSection: (setting: ScheduleSetting) => void;
  };
  /**
   * Колонки табличного пункта — целиком или никак, тем же приёмом, что расписание:
   * половина управления, приехавшая без второй половины, — это тип ответа, который
   * можно выбрать, но нечем настроить.
   *
   * Необязательно, потому что ту же строку рисует правка блока библиотеки. Там род
   * «таблица» и не предлагается: колонки заводить было бы негде.
   */
  readonly columns?: {
    readonly onAdd: () => void;
    readonly onTitle: (columnId: string, text: string) => void;
    readonly onNorm: (columnId: string, text: string) => void;
    readonly onRemove: (columnId: string) => void;
  };
  readonly onTitle: (text: string) => void;
  readonly onPatch: (patch: Partial<Item>) => void;
  readonly onRemove: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly onPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
}

export function itemInputId(itemId: string): string {
  return `item-title-${itemId}`;
}

const ROW_CLASS =
  "grid grid-cols-[28px_1fr_auto] items-center gap-[var(--space-5)] px-[var(--space-6)] py-[var(--space-4)]";
/** Линия под строкой. У табличного пункта она уезжает под панель колонок: панель —
    продолжение той же строки, а не соседняя. */
const ROW_LINE_CLASS = "border-b border-[var(--line)]";
const TITLE_CLASS =
  "text-ink h-[var(--control-h)] w-full rounded-[var(--r-control)] border border-transparent bg-transparent pl-[var(--space-3)] text-[length:var(--fs-lead)] hover:border-[var(--line)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const SELECT_CLASS =
  "text-ink bg-surface h-[var(--control-h-sm)] w-auto rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-4)] text-[length:var(--fs-dense)] focus:border-[var(--accent)] focus:outline-none";
const BOUND_CLASS =
  "text-ink bg-surface h-[var(--control-h-sm)] w-[62px] rounded-[var(--r-control)] border border-[var(--line-control)] text-center font-[family-name:var(--font-num)] text-[length:var(--fs-dense)] focus:border-[var(--accent)] focus:outline-none";

const ITEM_TYPES: readonly ItemType[] = ["bool", "number", "text"];
const ITEM_TYPES_WITH_TABLE: readonly ItemType[] = [...ITEM_TYPES, "table"];

/** Порядок положений переключателя уровня: слева направо, от лёгкого к тяжёлому. */
const SEVERITIES: readonly Severity[] = ["normal", "major", "critical"];

/**
 * Вид выбранного положения. Все три сидят на `bg-surface`, а различаются цветом
 * подписи и обводкой: белая подпись на `--warn-mark` давала контраст 2,3:1 против
 * порога 4,5 — axe поймал это на сквозном прогоне. Прежний тумблер проходил потому,
 * что `--warn-mark` был фоном дорожки БЕЗ текста, а подпись лежала на фоне строки.
 */
const SEVERITY_TONE: Readonly<Record<Severity, string>> = {
  normal: "bg-surface text-[var(--ink-2)] shadow-[var(--sh-xs)]",
  major:
    "bg-surface text-[var(--ink)] shadow-[var(--sh-xs)] ring-1 ring-[var(--line-strong)]",
  critical:
    "bg-surface text-[var(--warn-ink)] shadow-[var(--sh-xs)] ring-1 ring-[var(--warn-mark)]",
};

/** Ключ подписи типа ответа: "typeBool" | "typeNumber" | "typeText". */
function typeKey(type: ItemType): string {
  if (type === "number") return "typeNumber";
  if (type === "text") return "typeText";
  if (type === "table") return "typeTable";
  return "typeBool";
}

/** Граница диапазона: пустое поле означает «границы нет», а не ноль. */
function boundValue(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function parseBound(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

export function ItemRow({
  item,
  ordinal,
  locale,
  schedule,
  columns,
  onTitle,
  onPatch,
  onRemove,
  onKeyDown,
  onPaste,
}: ItemRowProps) {
  const t = useTranslations("editor.item");
  const severity = severityOf(item);
  // Род «таблица» предлагается только там, где колонки есть чем задать; уже
  // заведённый табличный пункт показывает свой род всегда, иначе список родов
  // молча показывал бы не тот, что стоит у пункта.
  const types =
    columns === undefined && item.type !== "table"
      ? ITEM_TYPES
      : ITEM_TYPES_WITH_TABLE;
  const showColumns = item.type === "table" && columns !== undefined;

  return (
    <div
      data-testid="editor-item"
      data-severity={severity}
      className={
        severity === "critical"
          ? "bg-[var(--warn-soft)]"
          : "hover:bg-[var(--surface-2)]"
      }
    >
      <div className={`${ROW_CLASS} ${showColumns ? "" : ROW_LINE_CLASS}`}>
        <div className="text-right text-[length:var(--fs-meta)] text-[var(--ink-3)]">
          {ordinal}
        </div>

        <input
          id={itemInputId(item.id)}
          data-testid="item-title"
          className={TITLE_CLASS}
          value={pickEditorText(item.title, locale)}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            onTitle(event.target.value);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />

        <div className="flex items-center gap-[var(--space-4)]">
          <select
            data-testid="item-type"
            className={`${SELECT_CLASS} pr-[var(--space-8)]`}
            style={SELECT_ARROW_SMALL}
            value={item.type}
            aria-label={t("typeBool")}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              onPatch({ type: event.target.value as ItemType });
            }}
          >
            {types.map((type) => (
              <option key={type} value={type}>
                {t(typeKey(type))}
              </option>
            ))}
          </select>

          {item.type === "number" ? (
            <span className="flex items-center gap-[var(--space-3)] text-[length:var(--fs-meta)] text-[var(--ink-3)]">
              {t("from")}
              <input
                data-testid="item-min"
                className={BOUND_CLASS}
                inputMode="decimal"
                aria-label={t("min")}
                value={boundValue(item.min)}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  onPatch({ min: parseBound(event.target.value) });
                }}
              />
              {t("to")}
              <input
                data-testid="item-max"
                className={BOUND_CLASS}
                inputMode="decimal"
                aria-label={t("max")}
                value={boundValue(item.max)}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  onPatch({ max: parseBound(event.target.value) });
                }}
              />
            </span>
          ) : null}

          {/* Регулярность стоит между «чем отвечают» и «насколько важно»: сперва род
            ответа, потом как часто его дают, и только потом вес пункта. */}
          {schedule === undefined || item.type === "table" ? null : (
            <ScheduleChip
              item={item}
              window={schedule.window}
              live={schedule.live}
              onApply={schedule.onApply}
              onApplyToSection={schedule.onApplyToSection}
            />
          )}

          <span
            data-testid="item-severity"
            role="group"
            aria-label={t("severityLabel")}
            className="inline-flex gap-[2px] rounded-[var(--r-control)] bg-[var(--seg-track)] p-[2px] whitespace-nowrap"
          >
            {SEVERITIES.map((level) => (
              <label
                key={level}
                className="cursor-pointer"
                data-testid={`item-severity-${level}`}
                data-selected={severity === level ? "true" : "false"}
              >
                <input
                  type="radio"
                  name={`severity-${item.id}`}
                  value={level}
                  checked={severity === level}
                  onChange={() => {
                    onPatch({ severity: level });
                  }}
                  className="peer sr-only"
                />
                <span
                  className={`inline-flex h-[19px] items-center rounded-[var(--r-mark)] px-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] uppercase transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-[var(--focus-ring)] ${
                    severity === level
                      ? SEVERITY_TONE[level]
                      : // Не `--ink-3`: на дорожке `--seg-track` он даёт 4,4:1 — ниже
                        // порога. `--ink-2` даёт 4,7:1 и не спорит с выбранным положением,
                        // которое отличается фоном и тенью, а не только цветом подписи.
                        "text-[var(--ink-2)]"
                  }`}
                >
                  {t(level)}
                </span>
              </label>
            ))}
          </span>

          <button
            type="button"
            data-testid="item-remove"
            aria-label={t("remove")}
            className="text-err flex h-[var(--control-h-sm)] cursor-pointer items-center rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-5)] hover:border-[var(--err-line)] hover:bg-[var(--err-soft)]"
            onClick={onRemove}
          >
            ×
          </button>
        </div>
      </div>

      {showColumns ? (
        <TableColumns
          item={item}
          locale={locale}
          onAdd={columns.onAdd}
          onTitle={columns.onTitle}
          onNorm={columns.onNorm}
          onRemove={columns.onRemove}
        />
      ) : null}
    </div>
  );
}
