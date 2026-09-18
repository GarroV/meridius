import { useTranslations } from "next-intl";

import type { Item } from "@/blocks/data";
// `severityOf` берётся напрямую из модуля уровней, а НЕ из входа `@/blocks/data`:
// эта строка попадает в клиентскую сборку (её рисует клиентский `ChecklistEditor`),
// а вход блока data тянет за собой пул подключений и драйвер `pg`, которого в браузере
// нет — сборка админки падала на `module-not-found`. Модуль уровней чистый: ни базы,
// ни узловых зависимостей.
import { severityOf } from "@/blocks/data/severity";

import { pickEditorText } from "../localized-text";

/**
 * Пункт вставленного блока библиотеки: только для чтения. Правится он в самом блоке,
 * и правка приходит во все черновики сразу (D011) — поэтому здесь ни полей, ни кнопок,
 * а тип и уровень показаны метками, как в эталоне.
 */
export function LinkedItemRow({
  item,
  ordinal,
  locale,
}: {
  readonly item: Item;
  readonly ordinal: number;
  readonly locale: string;
}) {
  const t = useTranslations("editor.item");
  const severity = severityOf(item);

  const typeText =
    item.type === "number"
      ? `${t("typeNumber")}${range(item, locale)}`
      : item.type === "text"
        ? t("typeText")
        : t("typeBool");

  return (
    <div
      data-testid="editor-item"
      data-linked="true"
      className={`grid grid-cols-[28px_1fr_auto] items-center gap-[var(--space-5)] border-b border-[var(--line)] px-[var(--space-6)] py-[var(--space-4)] opacity-85 ${severity === "critical" ? "bg-[var(--warn-soft)]" : ""}`}
    >
      <div className="text-right text-[length:var(--fs-meta)] text-[var(--ink-3)]">
        {ordinal}
      </div>
      <div className="text-[length:var(--fs-lead)]">
        {pickEditorText(item.title, locale)}
      </div>
      <div className="flex items-center gap-[var(--space-4)]">
        <span className="bg-surface-2 inline-flex h-[20px] items-center rounded-[var(--r-mark)] border border-[var(--line-strong)] px-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] whitespace-nowrap text-[var(--ink-2)] uppercase">
          {typeText}
        </span>
        {severity === "normal" ? null : (
          <span
            className={`inline-flex h-[20px] items-center rounded-[var(--r-mark)] border px-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] whitespace-nowrap uppercase ${
              severity === "critical"
                ? "border-[var(--warn-line)] bg-[var(--warn-soft)] text-[var(--warn-ink)]"
                : "bg-surface-2 border-[var(--line-strong)] text-[var(--ink-2)]"
            }`}
          >
            {t(severity)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Диапазон числового пункта в метке: показывается та граница, которая задана, и
 * единица измерения рядом с ней (D110) — тот же порядок и разделитель, что на
 * экране заполнения (`fill/ui/FillForm.tsx#rangeLabel`), только без вердикта
 * попадания в границы, которому здесь взяться неоткуда — блоку `library` неизвестна
 * ни одна настоящая отметка. Единица без единой границы тоже законна и показывается.
 */
function range(item: Item, locale: string): string {
  const bounds =
    item.min === undefined && item.max === undefined
      ? ""
      : `${item.min === undefined ? "" : String(item.min)}…${item.max === undefined ? "" : String(item.max)}`;
  const unit = pickEditorText(item.unit, locale);
  const measure = [bounds, unit].filter((part) => part !== "").join(" ");
  return measure === "" ? "" : ` · ${measure}`;
}
