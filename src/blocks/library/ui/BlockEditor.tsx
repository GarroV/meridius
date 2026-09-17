"use client";

// Правка блока библиотеки по эталону `docs/furca/design/screens/library.html`:
// название сверху, пункты списком, одна кнопка «Сохранить блок».
//
// Пункты живут в состоянии как ОДНА секция, а не как голый список: тогда работают уже
// написанные и покрытые тестами правила редактора — Enter создаёт следующий пункт,
// Alt+стрелки переставляют, вставка многострочного текста превращается в пачку пунктов.
// Заводить второй, «почти такой же» набор правил для блоков значило бы, что клавиатура
// в двух местах продукта ведёт себя по-разному (принцип 5).
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";

import { useLive } from "@/blocks/core/ui/use-live";
import type { Item, Section } from "@/blocks/data";
import {
  addItemAfter,
  insertItems,
  moveItem,
  removeItem,
  setItemTitle,
  updateItem,
} from "@/blocks/editor/editing";
import { parsePastedLines, parsePastedList } from "@/blocks/editor/paste";
import { itemInputId, ItemRow } from "@/blocks/editor/ui/ItemRow";

import type { LibraryActionState } from "../action-state";
import { INITIAL_LIBRARY_STATE } from "../action-state";
import { submitSaveBlock } from "../actions";

export interface BlockEditorProps {
  readonly blockId: string;
  readonly locale: string;
  readonly initialTitle: string;
  readonly initialItems: readonly Item[];
}

/** Опознаватель служебной секции: наружу он не уходит, в базу — тем более. */
const BLOCK_SECTION_ID = "block-items";

/** Одна вставка из буфера превращает многострочный текст в пункты; одна строка — нет. */
const MIN_PASTED_LINES = 2;

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const CARD_HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const TITLE_INPUT_CLASS =
  "text-ink bg-surface h-[var(--control-h)] w-full max-w-[280px] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-lead)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const PRIMARY_BUTTON_CLASS =
  "bg-accent flex h-[var(--control-h)] cursor-pointer items-center rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] disabled:cursor-default disabled:opacity-45";
const SMALL_BUTTON_CLASS =
  "bg-surface text-ink flex h-[var(--control-h-sm)] cursor-pointer items-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";

function startSections(items: readonly Item[]): Section[] {
  return [
    {
      id: BLOCK_SECTION_ID,
      title: {},
      source: "own",
      items: [...items],
    },
  ];
}

export function BlockEditor(props: BlockEditorProps) {
  const t = useTranslations("library");
  const { locale } = props;

  const [sections, setSections] = useState<Section[]>(
    startSections(props.initialItems),
  );
  const [title, setTitle] = useState(props.initialTitle);
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const live = useLive();

  const [state, saveAction, saving] = useActionState(
    submitSaveBlock,
    INITIAL_LIBRARY_STATE,
  );

  // Сброса состояния по приходу новых пропов здесь нет намеренно: открытие другого блока
  // РАЗМОНТИРУЕТ компонент (`key={selection.id}` на вызове), а сброс на каждый серверный
  // перерисов затирал бы несохранённую правку молча — самый дорогой вид потери работы.

  // Курсор идёт за пунктом: после Enter — в новый, после Alt+стрелки — за переставленным.
  useEffect(() => {
    if (focusItemId === null) return;
    document.getElementById(itemInputId(focusItemId))?.focus();
    setFocusItemId(null);
  }, [focusItemId]);

  const items = sections[0]?.items ?? [];

  function handleKeyDown(
    itemId: string,
    event: KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const next = addItemAfter(sections, BLOCK_SECTION_ID, itemId);
      setSections(next.sections);
      setFocusItemId(next.focusItemId);
      return;
    }

    if (!event.altKey) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

    event.preventDefault();
    const moved = moveItem(sections, itemId, event.key === "ArrowUp" ? -1 : 1);
    if (!moved.moved) return;
    setSections(moved.sections);
    setFocusItemId(itemId);
  }

  function handlePaste(
    itemId: string,
    event: ClipboardEvent<HTMLInputElement>,
  ): void {
    const text = event.clipboardData.getData("text/plain");
    // Одна строка — обычная вставка текста в поле: перехватывать её незачем.
    if (parsePastedLines(text).length < MIN_PASTED_LINES) return;
    const pasted = parsePastedList(text, locale);
    if (pasted.length === 0) return;
    event.preventDefault();
    setSections(insertItems(sections, BLOCK_SECTION_ID, itemId, pasted));
    setFocusItemId(pasted.at(-1)?.id ?? null);
  }

  function addItem(): void {
    const next = addItemAfter(
      sections,
      BLOCK_SECTION_ID,
      items.at(-1)?.id ?? null,
    );
    setSections(next.sections);
    setFocusItemId(next.focusItemId);
  }

  return (
    // Два факта о разметке, без которых снаружи не отличить рабочий экран от
    // неотличимо похожего на него (T121):
    //  • `data-block-id` — ЧЕЙ это блок. Экран библиотеки показывает правку блока
    //    всегда, поэтому во время перехода к другому блоку на экране стоит форма
    //    ПРЕЖНЕГО блока с тем же `data-testid`. Правка, попавшая в неё, исчезает
    //    молча: переход доезжает, компонент перемонтируется по `key`, и в поле
    //    возвращается название пришедшего блока.
    //  • `data-live` — ожил ли экран. До этого поле названия принимает ввод, но в
    //    состояние он не попадает (обработчика ещё нет), и первый же перерисов
    //    возвращает в поле прежнее значение — правка снова исчезает молча.
    <form
      action={saveAction}
      data-testid="block-editor"
      data-block-id={props.blockId}
      data-live={live ? "true" : undefined}
      className={CARD_CLASS}
    >
      <input type="hidden" name="blockId" value={props.blockId} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <div className={CARD_HEAD_CLASS}>
        <input
          data-testid="block-title"
          className={TITLE_INPUT_CLASS}
          name="title"
          value={title}
          aria-label={t("blockTitleLabel")}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
        <div className="ml-auto flex items-center gap-[var(--space-5)]">
          <SaveStatus state={state} />
          <button
            type="submit"
            data-testid="save-block"
            className={PRIMARY_BUTTON_CLASS}
            disabled={saving}
          >
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>

      <div>
        {items.length === 0 ? (
          <p
            data-testid="block-no-items"
            className="m-0 px-[var(--space-7)] py-[var(--space-7)] text-[length:var(--fs-dense)] text-[var(--ink-3)]"
          >
            {t("noItems")}
          </p>
        ) : (
          items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              ordinal={index + 1}
              locale={locale}
              onTitle={(text) => {
                setSections(setItemTitle(sections, item.id, locale, text));
              }}
              onPatch={(patch) => {
                setSections(updateItem(sections, item.id, patch));
              }}
              onRemove={() => {
                setSections(removeItem(sections, item.id));
              }}
              onKeyDown={(event) => {
                handleKeyDown(item.id, event);
              }}
              onPaste={(event) => {
                handlePaste(item.id, event);
              }}
            />
          ))
        )}

        <div className="px-[var(--space-6)] py-[var(--space-4)]">
          <button
            type="button"
            data-testid="add-block-item"
            className={SMALL_BUTTON_CLASS}
            onClick={addItem}
          >
            {t("addItem")}
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * Подтверждение и отказ рядом с кнопкой. Молчание после нажатия означало бы, что
 * методист считает блок сохранённым, ничем это не подтвердив.
 */
function SaveStatus({ state }: { readonly state: LibraryActionState }) {
  const t = useTranslations("library");

  if (state.status === "saved") {
    return (
      <span
        data-testid="block-saved"
        className="text-[length:var(--fs-meta)] whitespace-nowrap text-[var(--ok)]"
      >
        {t("saved")}
      </span>
    );
  }

  if (state.status !== "failed") return null;

  return (
    <span
      data-testid="block-error"
      role="alert"
      className="text-err rounded-[var(--r-control)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-5)] py-[var(--space-3)] text-[length:var(--fs-dense)]"
    >
      {t(`errors.${state.errorCode ?? "unknown"}`, { limit: state.limit ?? 0 })}
    </span>
  );
}
