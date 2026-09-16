"use client";

// Экран редактора чек-листа по эталону `docs/furca/design/screens/editor.html`.
//
// Здесь работает главное обещание блока: чек-лист из двадцати пунктов заводится за минуты.
// Поэтому Enter создаёт следующий пункт и переносит в него курсор, Alt+стрелки переставляют
// пункт, а вставка многострочного текста превращается в пачку пунктов сразу — без единого
// касания мыши между строками (принцип 5, D020).
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";

import { useLive } from "@/blocks/core/ui/use-live";
import type { Item, Section } from "@/blocks/data";

import { INITIAL_EDITOR_STATE } from "../action-state";
import { submitPublish, submitSaveDraft } from "../actions";
import type { EditorStation, VersionSummary } from "../drafts";
import {
  addItemAfter,
  addSection,
  applyScheduleToSection,
  insertItems,
  insertLibrarySection,
  itemCount,
  moveItem,
  removeItem,
  removeSection,
  setItemSchedule,
  setItemTitle,
  setSectionTitle,
  unlinkSection,
  updateItem,
} from "../editing";
import type { LibraryEntry } from "../library-links";
import type { StationOption } from "../listing";
import { parsePastedLines, parsePastedList } from "../paste";
import type { WindowValue } from "../window-field";
import { WINDOW_FIELD, windowFieldValue } from "../window-field";
import { EditorStatus } from "./EditorStatus";
import { itemInputId } from "./ItemRow";
import { PropertiesCard } from "./PropertiesCard";
import { SectionCard } from "./SectionCard";
import { LibraryPanel, StationNotice, VersionsPanel } from "./SidePanels";

export interface ChecklistEditorProps {
  readonly checklistId: string;
  readonly locale: string;
  readonly initialTitle: string;
  readonly initialStationId: string;
  readonly initialWindow: WindowValue;
  readonly initialSections: readonly Section[];
  readonly stations: readonly StationOption[];
  readonly station: EditorStation | null;
  readonly versions: readonly VersionSummary[];
  readonly library: readonly LibraryEntry[];
  readonly nextVersionNumber: number;
  readonly previewHref: string;
  readonly crumbs: string;
}

const BUTTON_CLASS =
  "bg-surface text-ink flex h-[var(--control-h)] cursor-pointer items-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)] disabled:cursor-default disabled:opacity-60";
const PRIMARY_BUTTON_CLASS =
  "bg-accent flex h-[var(--control-h)] cursor-pointer items-center rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] disabled:cursor-default disabled:opacity-60";
const KBD_CLASS =
  "rounded-[var(--r-mark)] border border-b-2 border-[var(--line-control)] bg-[var(--surface-3)] px-[5px] py-[1px] font-[family-name:var(--font-num)] text-[length:var(--fs-micro)] font-medium text-[var(--ink-2)]";

/** Одна вставка из буфера превращает многострочный текст в пункты; одна строка — нет. */
const MIN_PASTED_LINES = 2;

export function ChecklistEditor(props: ChecklistEditorProps) {
  const t = useTranslations("editor");
  const { locale } = props;

  const [sections, setSections] = useState<Section[]>([
    ...props.initialSections,
  ]);
  const [title, setTitle] = useState(props.initialTitle);
  const [stationId, setStationId] = useState(props.initialStationId);
  const [window, setWindow] = useState<WindowValue>(props.initialWindow);
  const [focusItemId, setFocusItemId] = useState<string | null>(null);

  // Свойства чек-листа уезжают на сервер скрытыми полями из состояния, а до гидратации
  // состояния ещё нет: изменённое в первую секунду видно на экране, но в форму уходит
  // прежнее значение, и сохранение СТИРАЕТ привязку молча (#7). Поэтому при монтировании
  // состояние подхватывает то, что уже стоит в разметке.
  useEffect(() => {
    const station = document.getElementById("checklist-station");
    if (station instanceof HTMLSelectElement && station.value !== "") {
      setStationId((current) =>
        station.value === current ? current : station.value,
      );
    }
    const titleField = document.getElementById("checklist-title");
    if (titleField instanceof HTMLInputElement && titleField.value !== "") {
      setTitle((current) =>
        titleField.value === current ? current : titleField.value,
      );
    }
  }, []);
  // Вставка блока доступна из двух мест эталона: правой колонки и кнопки под секциями.
  const [pickingBlock, setPickingBlock] = useState(false);
  const live = useLive();

  const [saveState, saveAction, saving] = useActionState(
    submitSaveDraft,
    INITIAL_EDITOR_STATE,
  );
  const [publishState, publishAction, publishing] = useActionState(
    submitPublish,
    INITIAL_EDITOR_STATE,
  );

  // Курсор идёт за пунктом: после Enter — в новый, после Alt+стрелки — за переставленным.
  useEffect(() => {
    if (focusItemId === null) return;
    document.getElementById(itemInputId(focusItemId))?.focus();
    setFocusItemId(null);
  }, [focusItemId]);

  const insertedBlockIds = sections.flatMap((section) =>
    typeof section.source === "string" ? [] : [section.source.blockId],
  );

  function handleKeyDown(
    sectionId: string,
    itemId: string,
    event: KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const next = addItemAfter(sections, sectionId, itemId);
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

  function pasteInto(
    sectionId: string,
    itemId: string | null,
    text: string,
  ): boolean {
    const items = parsePastedList(text, locale);
    if (items.length === 0) return false;
    setSections(insertItems(sections, sectionId, itemId, items));
    setFocusItemId(items.at(-1)?.id ?? null);
    return true;
  }

  function handlePaste(
    sectionId: string,
    itemId: string,
    event: ClipboardEvent<HTMLInputElement>,
  ): void {
    const text = event.clipboardData.getData("text/plain");
    // Одна строка — обычная вставка текста в поле: перехватывать её незачем.
    if (parsePastedLines(text).length < MIN_PASTED_LINES) return;
    event.preventDefault();
    pasteInto(sectionId, itemId, text);
  }

  function insertBlock(blockId: string): void {
    const block = props.library.find((one) => one.id === blockId);
    if (block === undefined) return;
    setSections(insertLibrarySection(sections, block));
    setPickingBlock(false);
  }

  const total = itemCount(sections);
  let ordinal = 0;

  return (
    <div className="flex min-w-0 flex-col">
      <header className="bg-surface flex items-center gap-[var(--space-7)] border-b border-[var(--line-strong)] px-[var(--space-9)] py-[var(--space-7)]">
        <div className="flex min-w-0 flex-col gap-[var(--space-1)]">
          <div className="text-[length:var(--fs-meta)] text-[var(--ink-3)]">
            {props.crumbs}
          </div>
          <h1 className="text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold">
            {title}
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-[var(--space-4)]">
          <EditorStatus
            versions={props.versions}
            saveState={saveState}
            publishState={publishState}
          />
          <Link className={BUTTON_CLASS} href={props.previewHref}>
            {t("screen.preview")}
          </Link>
          <form action={saveAction}>
            <HiddenState
              checklistId={props.checklistId}
              locale={locale}
              title={title}
              stationId={stationId}
              window={window}
              sections={sections}
            />
            <button
              type="submit"
              data-testid="save-draft"
              className={BUTTON_CLASS}
              disabled={saving}
            >
              {saving ? t("screen.saving") : t("screen.save")}
            </button>
          </form>
          <form action={publishAction}>
            <HiddenState
              checklistId={props.checklistId}
              locale={locale}
              title={title}
              stationId={stationId}
              window={window}
              sections={sections}
            />
            <button
              type="submit"
              data-testid="publish"
              className={PRIMARY_BUTTON_CLASS}
              disabled={publishing}
            >
              {publishing
                ? t("screen.publishing")
                : t("screen.publish", { number: props.nextVersionNumber })}
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-col gap-[var(--space-8)] p-[var(--space-9)]">
        <div className="grid items-start gap-[var(--space-8)] [grid-template-columns:1fr_268px]">
          <div>
            <PropertiesCard
              title={title}
              stationId={stationId}
              window={window}
              stations={props.stations}
              onTitle={setTitle}
              onStation={setStationId}
              onWindow={setWindow}
            />

            {sections.map((section) => {
              const firstOrdinal = ordinal + 1;
              ordinal += section.items.length;
              return (
                <SectionCard
                  key={section.id}
                  section={section}
                  firstOrdinal={firstOrdinal}
                  locale={locale}
                  window={window}
                  live={live}
                  usageCount={usageOf(section, props.library)}
                  onSectionTitle={(text) => {
                    setSections(
                      setSectionTitle(sections, section.id, locale, text),
                    );
                  }}
                  onRemoveSection={() => {
                    setSections(removeSection(sections, section.id));
                  }}
                  onUnlink={() => {
                    setSections(unlinkSection(sections, section.id));
                  }}
                  onAddItem={(afterItemId) => {
                    const next = addItemAfter(
                      sections,
                      section.id,
                      afterItemId,
                    );
                    setSections(next.sections);
                    setFocusItemId(next.focusItemId);
                  }}
                  onItemTitle={(itemId, text) => {
                    setSections(setItemTitle(sections, itemId, locale, text));
                  }}
                  onItemPatch={(itemId, patch: Partial<Item>) => {
                    setSections(updateItem(sections, itemId, patch));
                  }}
                  onItemSchedule={(itemId, setting) => {
                    setSections(setItemSchedule(sections, itemId, setting));
                  }}
                  onSectionSchedule={(setting) => {
                    setSections(
                      applyScheduleToSection(sections, section.id, setting),
                    );
                  }}
                  onRemoveItem={(itemId) => {
                    setSections(removeItem(sections, itemId));
                  }}
                  onItemKeyDown={(itemId, event) => {
                    handleKeyDown(section.id, itemId, event);
                  }}
                  onItemPaste={(itemId, event) => {
                    handlePaste(section.id, itemId, event);
                  }}
                  onPasteText={(text) => {
                    pasteInto(
                      section.id,
                      section.items.at(-1)?.id ?? null,
                      text,
                    );
                  }}
                />
              );
            })}

            {pickingBlock ? (
              <div className="mt-[var(--space-8)]">
                <LibraryPanel
                  library={props.library}
                  insertedBlockIds={insertedBlockIds}
                  locale={locale}
                  onInsert={insertBlock}
                />
              </div>
            ) : null}

            <div
              data-testid="editor-footer"
              data-item-total={total}
              className="mt-[var(--space-8)] flex items-center gap-[var(--space-5)]"
            >
              <button
                type="button"
                data-testid="add-section"
                className={BUTTON_CLASS}
                onClick={() => {
                  const next = addSection(sections);
                  setSections(next.sections);
                }}
              >
                {t("section.add")}
              </button>
              <button
                type="button"
                data-testid="insert-block"
                // Кнопка клиентская и запасного пути не имеет: до того как редактор
                // оживёт, она в разметке, принимает нажатие и не открывает ничего.
                // Панель библиотеки при этом стоит в правой колонке всегда, поэтому
                // потерянное нажатие снаружи не видно вовсе — признак `data-live`
                // делает эту разницу наблюдаемой (T121).
                data-live={live ? "true" : undefined}
                className={BUTTON_CLASS}
                onClick={() => {
                  setPickingBlock((open) => !open);
                }}
              >
                {t("section.insertBlock")}
              </button>
              <span className="ml-auto flex flex-wrap items-center gap-[var(--space-6)] text-[length:var(--fs-meta)] text-[var(--ink-3)]">
                <span>
                  <kbd className={KBD_CLASS}>Enter</kbd> {t("keys.enter")}
                </span>
                <span>
                  <kbd className={KBD_CLASS}>Alt</kbd>+
                  <kbd className={KBD_CLASS}>↑</kbd>
                  <kbd className={KBD_CLASS}>↓</kbd> {t("keys.move")}
                </span>
                <span>
                  <kbd className={KBD_CLASS}>Cmd</kbd>+
                  <kbd className={KBD_CLASS}>V</kbd> {t("keys.paste")}
                </span>
              </span>
            </div>
          </div>

          <aside className="sticky top-[var(--space-9)] flex w-[268px] flex-col gap-[var(--space-6)] self-start">
            <VersionsPanel versions={props.versions} />
            <LibraryPanel
              library={props.library}
              insertedBlockIds={insertedBlockIds}
              locale={locale}
              onInsert={insertBlock}
            />
            <StationNotice station={props.station} />
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Сколько ещё чек-листов используют блок этой секции — для подписи «используется ещё в N». */
function usageOf(section: Section, library: readonly LibraryEntry[]): number {
  if (typeof section.source === "string") return 0;
  const blockId = section.source.blockId;
  return library.find((block) => block.id === blockId)?.usageCount ?? 0;
}

/**
 * Состояние экрана уходит на сервер скрытыми полями обеих форм: и «сохранить», и
 * «опубликовать» отправляют то, что сейчас на экране. Иначе публиковалась бы прошлая
 * правка, а методист смотрел бы на свежую.
 */
function HiddenState({
  checklistId,
  locale,
  title,
  stationId,
  window,
  sections,
}: {
  readonly checklistId: string;
  readonly locale: string;
  readonly title: string;
  readonly stationId: string;
  readonly window: WindowValue;
  readonly sections: readonly Section[];
}) {
  return (
    <>
      <input type="hidden" name="checklistId" value={checklistId} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="stationId" value={stationId} />
      {/* Окно едет одним полем — тем же, каким его отправляет список на заведении
          (`window-field.ts`): два разных вида одного свойства на одном контракте
          расходятся молча. Здесь список стоит ВНЕ обеих форм, поэтому отправляет
          его по-прежнему состояние экрана. */}
      <input
        type="hidden"
        name={WINDOW_FIELD}
        value={windowFieldValue(window)}
      />
      <input type="hidden" name="sections" value={JSON.stringify(sections)} />
    </>
  );
}
