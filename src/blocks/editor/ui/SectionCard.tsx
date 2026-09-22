import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from "react";

import type { ChecklistWindow, Item, Section } from "@/blocks/data";

import type { ScheduleSetting } from "../editing";
import { linkedBlockId } from "../editing";
import { pickEditorText } from "../localized-text";
import { libraryBlockPath } from "../routes";
import { ItemRow } from "./ItemRow";
import { LinkedItemRow } from "./LinkedItemRow";

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border shadow-[var(--sh-xs)]";
// `flex-wrap` — последний источник горизонтальной прокрутки на телефоне (T211):
// кнопки секции и подпись «N пунктов» не сжимаются, и шапка требовала 416 px при
// экране 375. Прокрутка прятала не текст, а кнопку удаления пункта: строки внутри
// карточки наследовали её ширину. На настольной ширине перенос не срабатывает.
const HEAD_CLASS =
  "flex flex-wrap items-center gap-[var(--space-5)] rounded-t-[var(--r-block)] border-b px-[var(--space-6)] py-[var(--space-5)]";
// `flex-1 min-w-0` обязательны: у `input` своя ширина по умолчанию (около двадцати
// знаков), она не растёт под содержимое и не сжимается под соседей. Без этого длинный
// заголовок секции обрезался на середине слова — «Opening 05:00–08:00 · S».
const TITLE_CLASS =
  "font-ui text-ink min-w-0 flex-1 rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-3)] py-[var(--space-2)] text-[length:var(--fs-body)] font-semibold hover:border-[var(--line-control)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const GHOST_BUTTON_CLASS =
  "flex h-[var(--control-h-sm)] cursor-pointer items-center rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]";
const SMALL_BUTTON_CLASS =
  "bg-surface text-ink flex h-[var(--control-h-sm)] cursor-pointer items-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";
const META_CLASS =
  "text-[length:var(--fs-meta)] whitespace-nowrap text-[var(--ink-3)]";
const TAG_CLASS =
  "inline-flex h-[20px] items-center rounded-[var(--r-mark)] border px-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] whitespace-nowrap uppercase";

export interface SectionCardProps {
  readonly section: Section;
  /** Номер первого пункта секции: нумерация в эталоне сквозная по всему чек-листу. */
  readonly firstOrdinal: number;
  readonly locale: string;
  /** Окно чек-листа: от него считается первый отрезок обхода в окне настройки. */
  readonly window: ChecklistWindow;
  /** Экран ожил (`useLive`): признак считается один раз наверху и спускается сюда. */
  readonly live: boolean;
  /** Сколько ещё чек-листов используют вставленный блок — «используется ещё в 6». */
  readonly usageCount: number;
  readonly onSectionTitle: (text: string) => void;
  readonly onRemoveSection: () => void;
  readonly onUnlink: () => void;
  readonly onAddItem: (afterItemId: string | null) => void;
  readonly onItemTitle: (itemId: string, text: string) => void;
  readonly onItemPatch: (itemId: string, patch: Partial<Item>) => void;
  readonly onItemSchedule: (itemId: string, setting: ScheduleSetting) => void;
  /** Колонки табличного пункта (D074): завести, переименовать, норма, удалить. */
  readonly onAddColumn: (itemId: string) => void;
  readonly onColumnTitle: (
    itemId: string,
    columnId: string,
    text: string,
  ) => void;
  readonly onColumnNorm: (
    itemId: string,
    columnId: string,
    text: string,
  ) => void;
  readonly onRemoveColumn: (itemId: string, columnId: string) => void;
  /**
   * «Применить ко всей секции» из окна настройки пункта. Секция носителем расписания
   * НЕ становится (D075): настройка переносится на её пункты, и это работа редактора,
   * а не новая сущность модели.
   */
  readonly onSectionSchedule: (setting: ScheduleSetting) => void;
  readonly onRemoveItem: (itemId: string) => void;
  readonly onItemKeyDown: (
    itemId: string,
    event: KeyboardEvent<HTMLInputElement>,
  ) => void;
  readonly onItemPaste: (
    itemId: string,
    event: ClipboardEvent<HTMLInputElement>,
  ) => void;
  readonly onPasteText: (text: string) => void;
}

/**
 * Секция чек-листа (D012). Своя секция правится целиком; вставленный блок библиотеки
 * показывается только для чтения — его пункты правятся в самом блоке, и правка приходит
 * во все черновики сразу (D011). Отсюда две ветки разметки в одном файле: на экране это
 * один и тот же прямоугольник, и разводить его по двум файлам значит развести и вид.
 */
export function SectionCard(props: SectionCardProps) {
  const t = useTranslations("editor.section");
  const { section, firstOrdinal, locale } = props;
  // Один разбор `source` на всю разметку: вид секции и адрес её блока — один и тот же факт.
  const blockId = linkedBlockId(section);
  const linked = blockId !== null;
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  // Свёрнутая секция из эталона: в чек-листе на полсотни пунктов иначе не найти нужную.
  const [collapsed, setCollapsed] = useState(false);

  const border = linked
    ? "border-[var(--reg-supp-line)]"
    : "border-[var(--line-strong)]";
  const headTone = linked
    ? "bg-[var(--reg-supp-soft)] border-[var(--reg-supp-line)]"
    : "bg-[var(--surface-3)] border-[var(--line-strong)]";

  return (
    <section
      data-testid="editor-section"
      data-linked={linked ? "true" : "false"}
      className={`${CARD_CLASS} ${border} mt-[var(--space-7)] first:mt-0`}
    >
      <div className={`${HEAD_CLASS} ${headTone}`}>
        {linked ? (
          <span
            className={`${TAG_CLASS} border-[var(--reg-supp-line)] bg-[var(--reg-supp-soft)] text-[var(--reg-supp)]`}
          >
            {t("libraryTag")}
          </span>
        ) : null}

        <input
          data-testid="section-title"
          className={TITLE_CLASS}
          value={pickEditorText(section.title, locale)}
          placeholder={t("titlePlaceholder")}
          aria-label={t("titlePlaceholder")}
          readOnly={linked}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            props.onSectionTitle(event.target.value);
          }}
        />

        <span className={META_CLASS}>
          {t("items", { count: section.items.length })}
          {linked && props.usageCount > 0
            ? ` · ${t("usedIn", { count: props.usageCount })}`
            : ""}
        </span>

        {blockId === null ? (
          <>
            <button
              type="button"
              data-testid="section-collapse"
              className={`${GHOST_BUTTON_CLASS} ml-auto`}
              onClick={() => {
                setCollapsed((open) => !open);
              }}
            >
              {collapsed ? t("expand") : t("collapse")}
            </button>
            <button
              type="button"
              data-testid="section-remove"
              className={`${GHOST_BUTTON_CLASS} text-err`}
              onClick={props.onRemoveSection}
            >
              {t("delete")}
            </button>
          </>
        ) : (
          <>
            {/* Ведёт сразу на нужный блок, а не в список: в библиотеке их полсотни.
                `Link`, а не `<a href>`: базовый путь площадки Next приставляет только
                тому, что идёт через его роутер (T088, D046). */}
            <Link
              data-testid="section-open-block"
              className={`${GHOST_BUTTON_CLASS} ml-auto no-underline`}
              href={libraryBlockPath(blockId)}
            >
              {t("openBlock")}
            </Link>
            <button
              type="button"
              data-testid="section-unlink"
              className={GHOST_BUTTON_CLASS}
              onClick={props.onUnlink}
            >
              {t("unlink")}
            </button>
          </>
        )}
      </div>

      {collapsed
        ? null
        : section.items.map((item, index) =>
            linked ? (
              <LinkedItemRow
                key={item.id}
                item={item}
                ordinal={firstOrdinal + index}
                locale={locale}
              />
            ) : (
              <ItemRow
                key={item.id}
                item={item}
                ordinal={firstOrdinal + index}
                locale={locale}
                schedule={{
                  window: props.window,
                  live: props.live,
                  onApply: (setting) => {
                    props.onItemSchedule(item.id, setting);
                  },
                  onApplyToSection: props.onSectionSchedule,
                }}
                columns={{
                  onAdd: () => {
                    props.onAddColumn(item.id);
                  },
                  onTitle: (columnId, text) => {
                    props.onColumnTitle(item.id, columnId, text);
                  },
                  onNorm: (columnId, text) => {
                    props.onColumnNorm(item.id, columnId, text);
                  },
                  onRemove: (columnId) => {
                    props.onRemoveColumn(item.id, columnId);
                  },
                }}
                onTitle={(text) => {
                  props.onItemTitle(item.id, text);
                }}
                onPatch={(patch) => {
                  props.onItemPatch(item.id, patch);
                }}
                onRemove={() => {
                  props.onRemoveItem(item.id);
                }}
                onKeyDown={(event) => {
                  props.onItemKeyDown(item.id, event);
                }}
                onPaste={(event) => {
                  props.onItemPaste(item.id, event);
                }}
              />
            ),
          )}

      {collapsed ? null : linked ? (
        <div className="border-t border-[var(--line)] px-[var(--space-6)] py-[var(--space-4)]">
          <span className={META_CLASS}>{t("libraryHint")}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-[var(--space-4)] border-t border-[var(--line)] px-[var(--space-6)] py-[var(--space-4)]">
          <div className="flex gap-[var(--space-4)]">
            <button
              type="button"
              data-testid="section-add-item"
              className={SMALL_BUTTON_CLASS}
              onClick={() => {
                props.onAddItem(section.items.at(-1)?.id ?? null);
              }}
            >
              {t("addItem")}
            </button>
            <button
              type="button"
              data-testid="section-paste"
              className={SMALL_BUTTON_CLASS}
              onClick={() => {
                setPasting((open) => !open);
              }}
            >
              {t("paste")}
            </button>
          </div>

          {pasting ? (
            <div className="flex flex-col gap-[var(--space-4)]">
              {/* Поле для вставки нужно тем, кому некуда вставлять: в пустой секции
                  нет строки пункта, а разрешение на чтение буфера мы не спрашиваем. */}
              <textarea
                data-testid="paste-area"
                autoFocus
                rows={6}
                className="text-ink bg-surface w-full rounded-[var(--r-control)] border border-[var(--line-control)] p-[var(--space-5)] text-[length:var(--fs-body)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none"
                placeholder={t("pastePlaceholder")}
                aria-label={t("pastePlaceholder")}
                value={pasted}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                  setPasted(event.target.value);
                }}
              />
              <div className="flex gap-[var(--space-4)]">
                <button
                  type="button"
                  data-testid="paste-apply"
                  className={SMALL_BUTTON_CLASS}
                  onClick={() => {
                    props.onPasteText(pasted);
                    setPasted("");
                    setPasting(false);
                  }}
                >
                  {t("pasteApply")}
                </button>
                <button
                  type="button"
                  className={GHOST_BUTTON_CLASS}
                  onClick={() => {
                    setPasted("");
                    setPasting(false);
                  }}
                >
                  {t("pasteCancel")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
