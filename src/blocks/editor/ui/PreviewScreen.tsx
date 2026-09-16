import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import type { Item, LocalizedText, Section, ShiftMode } from "@/blocks/data";
import { isShiftMode, sectionsForMode, severityOf } from "@/blocks/data";

import { loadEditor } from "../drafts";
import type { PeriodicItemView } from "../preview-items";
import { splitPeriodic } from "../preview-items";
import { checklistPath } from "../routes";
import { stepLabel } from "./step-label";

/**
 * Предпросмотр «как это увидит сотрудник» — та же разметка, что первый телефон
 * эталона `docs/furca/design/screens/fill.html` (класс `.fill`), но данные берутся
 * из живого черновика, а не из ответов сотрудника.
 *
 * Экран — показ, и таким останется: отвечает сотрудник, открыв чек-лист по QR-коду
 * станции (блок `fill`, адрес `/s/<код>`), и ответ принадлежит смене, а не черновику
 * методиста. Поэтому здесь нет ни одного элемента управления — в том числе в футере
 * (T115). Раньше футер был настоящей `<button disabled>`, повторявшей кнопку экрана
 * заполнения: там она законна (сотрудник ответит на пункты, и она оживёт), здесь
 * ожить не может никогда. Навсегда серая кнопка читается как сломанная, и человек
 * идёт выяснять, чего ему не хватает в правах, — так продукт уже терял людей трижды.
 */

type Translate = Awaited<ReturnType<typeof getTranslations>>;

const NOTICE_CLASS =
  "flex items-center gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)]";
const CARD_CLASS =
  "mx-auto my-[var(--space-8)] flex max-w-[420px] flex-col overflow-hidden rounded-[var(--r-screen)] border border-[var(--line-strong)] bg-surface shadow-[var(--sh-xs)]";
const HEADER_CLASS =
  "border-b border-[var(--line-strong)] px-[var(--space-7)] pt-[var(--space-7)] pb-[var(--space-6)]";
const SECTION_TITLE_CLASS =
  "px-[var(--space-7)] pt-[var(--space-8)] pb-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const ITEM_BASE_CLASS =
  "flex items-start gap-[var(--space-6)] px-[var(--space-7)] py-[var(--space-6)] min-h-[var(--tap-min)]";
const ITEM_BORDER_CLASS = "border-t border-[var(--line)]";
const ITEM_BOX_CLASS =
  "mt-[1px] h-[26px] w-[26px] flex-none rounded-[var(--r-control)] border-[1.5px] border-[var(--line-control-2)] bg-surface";
const ITEM_TEXT_CLASS = "flex-1 text-[length:var(--fs-lead)] leading-[21px]";
const ITEM_HINT_CLASS =
  "mt-[var(--space-2)] block text-[length:var(--fs-meta)] text-[var(--ink-3)]";
// Панель обхода: тот же приём и те же токены, что у панели обходов на экране станции
// (`fill/ui/RoundsPanel.tsx`), но без единого элемента управления — предпросмотр
// остаётся показом. Дублируется намеренно: границы модулей запрещают `editor` зависеть
// от `fill`, а общее здесь только внешнее сходство, не поведение.
const ROUNDS_PANEL_CLASS = "border-t-[6px] border-[var(--surface-3)]";
const ROUNDS_HEAD_CLASS =
  "px-[var(--space-7)] pt-[var(--space-8)] pb-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const ROUNDS_ROW_CLASS =
  "border-t border-[var(--line)] px-[var(--space-7)] py-[var(--space-6)]";
const ROUNDS_TITLE_CLASS =
  "text-[length:var(--fs-lead)] leading-[21px] font-semibold break-words";
const ROUNDS_LINE_CLASS =
  "mt-[var(--space-2)] text-[length:var(--fs-meta)] text-[var(--ink-2)]";
const ROUNDS_NOTE_CLASS =
  "mt-[var(--space-1)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const FOOTER_CLASS =
  "mt-auto border-t border-[var(--line-strong)] px-[var(--space-7)] pt-[var(--space-6)] pb-[var(--space-8)]";
// Футер экрана заполнения, показанный как есть на эталоне: тот же прямоугольник и та же
// приглушённость непройденного чек-листа (`opacity:.45` в `fill.html`). Но это картинка,
// а не кнопка, поэтому курсора «нажми меня» здесь нет — есть курсор текста.
const FOOTER_NOTE_CLASS =
  "flex h-[52px] w-full cursor-default items-center justify-center rounded-[var(--r-block)] border border-[var(--accent)] bg-accent text-[length:var(--fs-title)] font-medium text-[var(--ink-inverse)] opacity-45";

/** Название на языке интерфейса; если его нет — первое, что есть. */
function pickText(text: LocalizedText, locale: string): string {
  return text[locale] ?? Object.values(text)[0] ?? "";
}

function hasTitle(text: LocalizedText): boolean {
  return Object.keys(text).length > 0;
}

/**
 * Секции с пунктами, у которых есть название. Пункт без названия — это пустая
 * строка, которую методист ещё не заполнил (то же самое решение, что в
 * `validation.ts#parseItem`: такая строка не пункт, а место для будущего). Секция,
 * где таких пунктов не осталось, из предпросмотра тоже пропадает — не показывать
 * сотруднику заголовок без единого пункта под ним.
 */
function visibleSections(sections: readonly Section[]): Section[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasTitle(item.title)),
    }))
    .filter((section) => section.items.length > 0);
}

/** Порядок переключателя режима: полная смена слева, критичная справа. */
const MODES: readonly ShiftMode[] = ["normal", "reduced", "critical"];

const MODE_BAR_CLASS =
  "mx-auto mt-[var(--space-5)] flex max-w-[420px] gap-[2px] rounded-[var(--r-control)] bg-[var(--seg-track)] p-[2px]";
const MODE_TAB_CLASS =
  "flex-1 rounded-[var(--r-mark)] px-[var(--space-4)] py-[var(--space-3)] text-center text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] uppercase";
const MODE_TAB_ON_CLASS = "bg-surface text-[var(--ink)] shadow-[var(--sh-xs)]";
const MODE_TAB_OFF_CLASS = "text-[var(--ink-3)]";

function totalItems(sections: readonly Section[]): number {
  return sections.reduce((total, section) => total + section.items.length, 0);
}

/** Подсказка о границах числового пункта: обе, если есть обе, иначе — какая есть. */
function rangeHint(item: Item, t: Translate): string | null {
  if (item.type !== "number") return null;
  if (item.min !== undefined && item.max !== undefined) {
    return t("preview.range", { min: item.min, max: item.max });
  }
  if (item.min !== undefined) return String(item.min);
  if (item.max !== undefined) return String(item.max);
  return null;
}

/**
 * Табличный пункт в предпросмотре — перечень колонок, а не пустая таблица (D074).
 *
 * Строки заводит сотрудник в смену, и в черновике их нет ни одной: рисовать пустую
 * сетку значило бы показывать методисту не то, что увидит сотрудник. Показывается то,
 * что методист задал сам, — колонки и нормы над ними.
 */
function tableHint(item: Item, locale: string, t: Translate): string | null {
  if (item.type !== "table") return null;
  const columns = item.columns ?? [];
  if (columns.length === 0) return t("preview.tableEmpty");
  const names = columns.map((column) => {
    const title = pickText(column.title, locale);
    const norm = column.norm === undefined ? "" : pickText(column.norm, locale);
    return norm === "" ? title : t("preview.tableNorm", { title, norm });
  });
  return t("preview.table", { columns: names.join(" · ") });
}

function ItemRow({
  item,
  locale,
  t,
  isFirst,
}: {
  readonly item: Item;
  readonly locale: string;
  readonly t: Translate;
  readonly isFirst: boolean;
}): ReactElement {
  const range = rangeHint(item, t);
  const table = tableHint(item, locale, t);
  const severity = severityOf(item);

  return (
    <div
      data-testid="preview-item"
      className={`${ITEM_BASE_CLASS} ${isFirst ? "" : ITEM_BORDER_CLASS}`}
    >
      <span className={ITEM_BOX_CLASS} />
      <span className={ITEM_TEXT_CLASS}>
        {pickText(item.title, locale)}
        {severity === "normal" ? null : (
          <span
            className={`ml-[var(--space-2)] font-bold ${
              severity === "critical"
                ? "text-[var(--warn-mark)]"
                : "text-[var(--ink-3)]"
            }`}
          >
            !
          </span>
        )}
        {severity === "normal" ? null : (
          <span className={ITEM_HINT_CLASS}>
            {severity === "critical"
              ? t("preview.critical")
              : t("preview.major")}
          </span>
        )}
        {range !== null ? (
          <span className={ITEM_HINT_CLASS}>{range}</span>
        ) : null}
        {table !== null ? (
          <span data-testid="preview-table" className={ITEM_HINT_CLASS}>
            {table}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Периодический пункт в предпросмотре — СОСТОЯНИЕ пункта, а не сетка часов (T137, D076).
 *
 * Здесь нет ни «сейчас», ни отметок: предпросмотр смотрит на черновик, а не на смену.
 * Поэтому строка говорит ровно то, что про пункт известно методисту, — как часто его
 * обходят и напомнит ли планшет при просрочке. Сетка часов не рисуется и на станции:
 * на бумаге её рисуют потому, что иначе регулярность не покажешь, а в продукте она
 * уехала в отчёт (D065).
 */
function PeriodicRow({
  view,
  locale,
  t,
  ts,
}: {
  readonly view: PeriodicItemView;
  readonly locale: string;
  readonly t: Translate;
  readonly ts: Translate;
}): ReactElement {
  const { item } = view;
  const remind = item.remindEveryMinutes;

  return (
    <div data-testid="preview-round" className={ROUNDS_ROW_CLASS}>
      <div className={ROUNDS_TITLE_CLASS}>{pickText(item.title, locale)}</div>
      {(item.schedule ?? []).map((segment) => (
        <div
          key={`${segment.from}-${segment.to}-${String(segment.everyMinutes)}`}
          className={ROUNDS_LINE_CLASS}
        >
          {t("preview.roundsEvery", {
            from: segment.from,
            to: segment.to,
            step: stepLabel(segment.everyMinutes, ts),
          })}
        </div>
      ))}
      <div className={ROUNDS_NOTE_CLASS}>
        {remind === undefined
          ? t("preview.roundsSilent")
          : t("preview.roundsRemind", { count: remind })}
      </div>
    </div>
  );
}

function ProgressBar({
  total,
  t,
}: {
  readonly total: number;
  readonly t: Translate;
}): ReactElement {
  return (
    <div className="mt-[var(--space-6)] flex items-center gap-[var(--space-5)]">
      <span className="h-[4px] flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <i style={{ width: "0%" }} className="bg-accent block h-full" />
      </span>
      <span className="text-[length:var(--fs-meta)] text-[var(--ink-2)] whitespace-nowrap">
        {t("preview.progress", { done: 0, total })}
      </span>
    </div>
  );
}

export async function PreviewScreen({
  id,
  mode: requested,
}: {
  readonly id: string;
  /** Режим смены, в котором смотрят предпросмотр; по умолчанию полная смена. */
  readonly mode?: string | undefined;
}): Promise<ReactElement> {
  const state = await loadEditor(id);
  if (state === null) notFound();

  const locale = await getLocale();
  const t = await getTranslations("editor");

  const title = pickText(state.checklist.title, locale);
  const address =
    state.station === null
      ? t("list.noStation")
      : `${state.station.countryName} · ${state.station.storeName} · ${state.station.name}`;
  // Методист обязан видеть своими глазами, во что превращается его чек-лист на
  // тридцать пунктов в критичную смену. Иначе он узнает это от повара через две
  // недели, а обещание предпросмотра «так это увидит сотрудник» станет ложью.
  const mode: ShiftMode = isShiftMode(requested) ? requested : "normal";
  // Деление идёт ПОСЛЕ отбора по режиму смены: периодический пункт выпадает по уровню
  // так же, как обычный, и в критичную смену обхода по нему сегодня нет вовсе.
  const split = splitPeriodic(
    sectionsForMode(visibleSections(state.sections), mode),
  );
  const sections = split.sections;
  const total = totalItems(sections);
  const ts = await getTranslations("editor.schedule");

  return (
    <div
      data-testid="preview-screen"
      className="min-h-screen bg-[var(--canvas)]"
    >
      <div className="mx-auto max-w-[420px] px-[var(--space-6)] pt-[var(--space-6)]">
        <div className={NOTICE_CLASS}>
          <div className="flex-1">{t("preview.notice")}</div>
          <Link
            href={checklistPath(id)}
            className="font-medium whitespace-nowrap"
          >
            {t("preview.back")}
          </Link>
        </div>
        <div className={MODE_BAR_CLASS} data-testid="preview-mode-bar">
          {MODES.map((option) => (
            <Link
              key={option}
              href={`${checklistPath(id)}/preview?mode=${option}`}
              data-testid={`preview-mode-${option}`}
              data-selected={option === mode ? "true" : "false"}
              className={`${MODE_TAB_CLASS} ${option === mode ? MODE_TAB_ON_CLASS : MODE_TAB_OFF_CLASS}`}
            >
              {t(`preview.mode.${option}`)}
            </Link>
          ))}
        </div>
      </div>

      <div className={CARD_CLASS}>
        <header className={HEADER_CLASS}>
          <div className="text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold">
            {title}
          </div>
          <div className="mt-[var(--space-2)] text-[length:var(--fs-meta)] text-[var(--ink-3)]">
            {address}
          </div>
          {total > 0 ? <ProgressBar total={total} t={t} /> : null}
        </header>

        {total === 0 && split.periodic.length === 0 ? (
          <p className="m-0 p-[var(--space-7)] text-[length:var(--fs-dense)] text-[var(--ink-3)]">
            {t("preview.empty")}
          </p>
        ) : (
          <>
            {sections.map((section, sectionIndex) => (
              <div key={section.id}>
                {pickText(section.title, locale) === "" ? null : (
                  <div className={SECTION_TITLE_CLASS}>
                    {pickText(section.title, locale)}
                  </div>
                )}
                {section.items.map((item, itemIndex) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    locale={locale}
                    t={t}
                    isFirst={sectionIndex === 0 && itemIndex === 0}
                  />
                ))}
              </div>
            ))}
            {split.periodic.length === 0 ? null : (
              <div data-testid="preview-rounds" className={ROUNDS_PANEL_CLASS}>
                <div className={ROUNDS_HEAD_CLASS}>{t("preview.rounds")}</div>
                {split.periodic.map((view) => (
                  <PeriodicRow
                    key={view.item.id}
                    view={view}
                    locale={locale}
                    t={t}
                    ts={ts}
                  />
                ))}
                <div
                  className={`${ROUNDS_ROW_CLASS} ${ROUNDS_NOTE_CLASS} mt-0`}
                  data-testid="preview-rounds-note"
                >
                  {t("preview.roundsNote")}
                </div>
              </div>
            )}

            {/* Футер считает пункты формы: обход отмечают не отправкой чек-листа, и
                «осталось 3 пункта» с ними в счёте обещало бы работу, которой в форме
                нет. Пустая форма при живом обходе — законное состояние, и футера у неё
                нет вовсе: заканчивать нечего. */}
            {total === 0 ? null : (
              <div className={FOOTER_CLASS}>
                {/* Показ футера, а не кнопка: нажимать здесь нечего и никогда не будет
                  (см. объяснение у начала файла). Текст остаётся видимым и читаемым
                  вслух — методист обязан видеть то же, что увидит сотрудник. */}
                <div data-testid="preview-left" className={FOOTER_NOTE_CLASS}>
                  {t("preview.left", { count: total })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
