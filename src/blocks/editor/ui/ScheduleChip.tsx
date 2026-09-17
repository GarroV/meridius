"use client";

// Регулярность пункта: чип в строке и окно настройки за ним (T137).
//
// Почему чип, а не ещё один список в строке. Регулярность есть у меньшинства пунктов, а
// настроек у неё сразу три (отрезки, шаг, напоминание). Разложить их по строке значит
// сделать строку обычного пункта — а их большинство — вдвое шире ради того, чем никто не
// пользуется. Чип занимает одно слово, показывает состояние и открывает остальное.
//
// Окно НАКОПИТЕЛЬНОЕ, в отличие от всего остального в редакторе: тип, уровень и текст
// применяются мгновенно, а здесь между «поставил отрезок» и «готово» лежит ещё кнопка
// «применить ко всей секции» — то есть выбор адресата. Мгновенное применение означало бы,
// что к моменту нажатия этой кнопки пункт уже изменён, и отменить нечем.
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";

import type { ChecklistWindow, Item, ScheduleSegment } from "@/blocks/data";

import type { ScheduleSetting } from "../editing";
import {
  canAddSegment,
  chipSummary,
  MAX_SEGMENTS,
  nextSegment,
  REMIND_OPTIONS,
  removeSegment,
  replaceSegment,
  scheduleProblemOf,
  stepOptionsFor,
} from "../schedule-field";
import { SELECT_ARROW_SMALL } from "./select-style";
import { stepLabel } from "./step-label";

type Translate = ReturnType<typeof useTranslations>;

// Вид чипа вынесен в экспорт: ту же строку пункта рисует правка блока библиотеки, и там
// чип показывает регулярность, но не открывается (D097, T198). Одно место на оба экрана —
// потому что «блок в админке выглядит так же, как блок в чек-листе» (D096) перестаёт быть
// правдой в тот же день, когда вид скопирован.
//
// Разделено НЕ по красоте, а по обещанию (T224, дефект #101). Всё, чем элемент обещает
// нажатие, вынесено в `CHIP_ACTION_CLASS` и `CHIP_OFF_HOVER_CLASS` и добавляется тем, у
// кого нажатие есть. До этой правки показывающий чип библиотеки брал общий вид целиком, а
// с ним — отклик на наведение (замерено живым браузером: рамка 215,219,224 → 185,193,202,
// текст 98,107,119 → 92,102,114) и кольцо фокуса, которое `span` показать не может вовсе.
// Первое обещает нажатие, второго не бывает: мёртвое правило дожидается дня, когда
// элемент станет фокусируемым, и срабатывает уже не там, где его писали.
/** Коробка чипа: высота, рамка, шрифт. Ничего про нажатие. */
export const CHIP_CLASS =
  "flex h-[var(--control-h-sm)] items-center rounded-[var(--r-control)] border px-[var(--space-4)] text-[length:var(--fs-dense)] whitespace-nowrap";
// Две константы ниже НЕ экспортируются, и это не забывчивость: взять их наружу может
// только тот, у кого нажатие есть, а такой чип в продукте один — этот. Экспорт означал бы
// приглашение повторить ошибку T224 на следующем показывающем элементе.
/** Признаки нажимаемого: рука под курсором и кольцо фокуса. Только настоящей кнопке. */
const CHIP_ACTION_CLASS =
  "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]";
export const CHIP_OFF_CLASS =
  "bg-surface border-[var(--line-control)] text-[var(--ink-3)]";
/** Отклик погашенного чипа на наведение — тоже обещание нажатия, поэтому отдельно. */
const CHIP_OFF_HOVER_CLASS =
  "hover:border-[var(--line-control-2)] hover:text-[var(--ink-2)]";
export const CHIP_ON_CLASS =
  "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)] font-medium";
// Окно собрано по единственному задокументированному образцу модалки дизайн-системы
// (`design/reference/components.css`: `.overlay` + `.dialog`) — двухполосному: шапка на
// `--surface-3`, тело, подвал на `--surface-2` с кнопками. До T196 здесь стоял один
// плоский блок с рамкой: токены были настоящие, но СТРУКТУРА оказывалась вторым видом
// диалога, то есть продукт объяснял человеку одно и то же двумя способами. Ни один экран
// эталона `.dialog` живьём не использует, поэтому образцом служит сам css, а не снимок.
const BACKDROP_CLASS =
  "fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-[var(--space-6)]";
// Ширина эталона — 470 px, но не шире экрана: кабинет обязан оставаться пригодным для
// правки с телефона (D092), а жёсткие 470 на 375 px дали бы горизонтальную прокрутку.
const DIALOG_CLASS =
  "bg-surface flex max-h-full w-[min(470px,100%)] flex-col overflow-hidden rounded-[var(--r-block)] shadow-[var(--sh-modal)]";
const DIALOG_HEAD_CLASS =
  "flex items-center gap-[var(--space-4)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const DIALOG_TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
// Прокручивается ТЕЛО, а не окно целиком: у эталона на `.dialog` стоит `overflow: hidden`,
// и полосы обязаны остаться на месте — иначе на коротком экране кнопки уезжают за край
// вместе с содержимым, и добраться до них нечем.
const DIALOG_BODY_CLASS =
  "flex min-h-0 flex-col gap-[var(--space-6)] overflow-y-auto px-[var(--space-7)] py-[var(--space-6)]";
const DIALOG_FOOT_CLASS =
  "flex flex-wrap items-center gap-[var(--space-4)] border-t border-[var(--line)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-5)]";
const DIALOG_ESC_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const LABEL_CLASS =
  "text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const HINT_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const TIME_CLASS =
  "text-ink bg-surface h-[var(--control-h-sm)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-4)] font-[family-name:var(--font-num)] text-[length:var(--fs-dense)] focus:border-[var(--accent)] focus:outline-none";
const SELECT_CLASS =
  "text-ink bg-surface h-[var(--control-h-sm)] rounded-[var(--r-control)] border border-[var(--line-control)] pr-[var(--space-8)] pl-[var(--space-4)] text-[length:var(--fs-dense)] focus:border-[var(--accent)] focus:outline-none";
const BUTTON_CLASS =
  "bg-surface text-ink flex h-[var(--control-h)] cursor-pointer items-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-45";
const PRIMARY_BUTTON_CLASS =
  "bg-accent flex h-[var(--control-h)] cursor-pointer items-center rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-45";
const GHOST_BUTTON_CLASS =
  "flex h-[var(--control-h-sm)] cursor-pointer items-center rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-4)] text-[length:var(--fs-dense)] text-[var(--ink-2)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]";
const NOTICE_CLASS =
  "rounded-[var(--r-control)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-5)] py-[var(--space-4)] text-[length:var(--fs-meta)] text-[var(--err)]";

/** Подпись чипа: состояние пункта одним словом или одной строкой. */
function chipLabel(item: Item, t: Translate): string {
  const summary = chipSummary(item);
  if (summary.kind === "none") return t("chipOnce");
  if (summary.kind === "many") return t("chipMany", { count: summary.count });
  return t("chipSingle", {
    from: summary.from,
    to: summary.to,
    step: stepLabel(summary.everyMinutes, t),
  });
}

function SegmentRow({
  segment,
  index,
  t,
  onPatch,
  onRemove,
}: {
  readonly segment: ScheduleSegment;
  readonly index: number;
  readonly t: Translate;
  readonly onPatch: (patch: Partial<ScheduleSegment>) => void;
  readonly onRemove: () => void;
}): ReactElement {
  return (
    <div
      data-testid="schedule-segment"
      className="flex flex-wrap items-center gap-[var(--space-4)]"
    >
      <span className={HINT_CLASS}>{t("from")}</span>
      <input
        type="time"
        data-testid={`schedule-from-${String(index)}`}
        aria-label={t("from")}
        className={TIME_CLASS}
        value={segment.from}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          // Пустое значение приходит, пока время дописывается: браузер сообщает им
          // «поле пока не время». Записать его значило бы стереть отрезок на середине
          // набора, поэтому такой ход пропускается — в поле остаётся набранное.
          if (event.target.value === "") return;
          onPatch({ from: event.target.value });
        }}
      />
      <span className={HINT_CLASS}>{t("to")}</span>
      <input
        type="time"
        data-testid={`schedule-to-${String(index)}`}
        aria-label={t("to")}
        className={TIME_CLASS}
        value={segment.to}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          if (event.target.value === "") return;
          onPatch({ to: event.target.value });
        }}
      />
      <span className={HINT_CLASS}>{t("step")}</span>
      <select
        data-testid={`schedule-step-${String(index)}`}
        aria-label={t("step")}
        className={SELECT_CLASS}
        style={SELECT_ARROW_SMALL}
        value={String(segment.everyMinutes)}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          onPatch({ everyMinutes: Number(event.target.value) });
        }}
      >
        {stepOptionsFor(segment.everyMinutes).map((step) => (
          <option key={step} value={String(step)}>
            {stepLabel(step, t)}
          </option>
        ))}
      </select>
      <button
        type="button"
        data-testid={`schedule-remove-${String(index)}`}
        className={`${GHOST_BUTTON_CLASS} text-err ml-auto`}
        onClick={onRemove}
      >
        {t("removeSegment")}
      </button>
    </div>
  );
}

export interface ScheduleChipProps {
  readonly item: Item;
  /** Окно чек-листа: за его пределами обход не состоится, от него считается первый отрезок. */
  readonly window: ChecklistWindow;
  /** Экран ожил — то же обещание, что у кнопки «Вставить блок» (T121). */
  readonly live: boolean;
  readonly onApply: (setting: ScheduleSetting) => void;
  /** «Применить ко всей секции»: перенос настройки на её пункты, не свойство секции (D075). */
  readonly onApplyToSection: (setting: ScheduleSetting) => void;
}

export function ScheduleChip({
  item,
  window: checklistWindow,
  live,
  onApply,
  onApplyToSection,
}: ScheduleChipProps): ReactElement {
  const t = useTranslations("editor.schedule");
  const [open, setOpen] = useState(false);
  const [schedule, setSchedule] = useState<readonly ScheduleSegment[]>([]);
  const [remind, setRemind] = useState<number | undefined>();

  // Esc закрывает окно, ничего не применяя: это общий способ выйти из модального окна,
  // и без него единственный выход — мышью по кнопке.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openDialog(): void {
    // Черновик набирается ОТ ТЕКУЩЕГО состояния пункта при каждом открытии, а не хранится
    // между открытиями: пункт мог измениться «применением ко всей секции» из соседней
    // строки, и показать тогда прошлый черновик значит показать неправду.
    setSchedule(item.schedule ?? []);
    setRemind(item.remindEveryMinutes);
    setOpen(true);
  }

  // Правила расписания — одни и те же на обе стороны (`scheduleProblemOf` зовёт то же
  // `overlappingSegments`, которым отказывает запись). Ловим их здесь, а не отказом на
  // сохранении: отказ придёт через два экрана, и методист уже не вспомнит, какие
  // границы он свёл.
  const problem = scheduleProblemOf(schedule);
  const broken = problem !== null;
  const setting: ScheduleSetting = {
    schedule,
    // Частота без расписания не имеет смысла: звонить было бы нечему (D068).
    ...(remind === undefined || schedule.length === 0
      ? {}
      : { remindEveryMinutes: remind }),
  };

  function apply(toSection: boolean): void {
    if (broken) return;
    if (toSection) onApplyToSection(setting);
    else onApply(setting);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        data-testid="item-schedule-chip"
        data-kind={chipSummary(item).kind}
        // Кнопка клиентская и запасного пути не имеет: до того как редактор оживёт, она
        // стоит в разметке, принимает нажатие и не открывает ничего (T121).
        data-live={live ? "true" : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t("open")}
        className={`${CHIP_CLASS} ${CHIP_ACTION_CLASS} ${chipSummary(item).kind === "none" ? `${CHIP_OFF_CLASS} ${CHIP_OFF_HOVER_CLASS}` : CHIP_ON_CLASS}`}
        onClick={openDialog}
      >
        {chipLabel(item, t)}
      </button>

      {open ? (
        <div className={BACKDROP_CLASS}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("title")}
            data-testid="schedule-dialog"
            className={DIALOG_CLASS}
          >
            <div className={DIALOG_HEAD_CLASS}>
              <span className={DIALOG_TITLE_CLASS}>{t("title")}</span>
            </div>

            <div className={DIALOG_BODY_CLASS}>
              <div className={HINT_CLASS}>{t("hint")}</div>

              <div className="flex flex-col gap-[var(--space-5)]">
                <span className={LABEL_CLASS}>{t("segments")}</span>
                {schedule.length === 0 ? (
                  <span data-testid="schedule-none" className={HINT_CLASS}>
                    {t("none")}
                  </span>
                ) : (
                  schedule.map((segment, index) => (
                    <SegmentRow
                      // Отрезки различаются только содержимым, и оно меняется прямо в поле:
                      // ключом остаётся место в списке — оно у отрезка и есть опознаватель.
                      key={`${String(index)}-${segment.from}`}
                      segment={segment}
                      index={index}
                      t={t}
                      onPatch={(patch) => {
                        setSchedule((current) =>
                          replaceSegment(current, index, patch),
                        );
                      }}
                      onRemove={() => {
                        setSchedule((current) => removeSegment(current, index));
                      }}
                    />
                  ))
                )}

                {problem === null ? null : (
                  <div
                    data-testid="schedule-broken"
                    data-problem={problem.kind}
                    className={NOTICE_CLASS}
                  >
                    {problem.kind === "empty"
                      ? t("emptySegment", { number: problem.index + 1 })
                      : t("overlapSegments", {
                          first: problem.first + 1,
                          second: problem.second + 1,
                        })}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-[var(--space-5)]">
                  <button
                    type="button"
                    data-testid="schedule-add"
                    className={BUTTON_CLASS}
                    disabled={!canAddSegment(schedule)}
                    onClick={() => {
                      setSchedule((current) => [
                        ...current,
                        nextSegment(current, checklistWindow),
                      ]);
                    }}
                  >
                    {t("add")}
                  </button>
                  {canAddSegment(schedule) ? null : (
                    <span
                      data-testid="schedule-add-hint"
                      className={HINT_CLASS}
                    >
                      {schedule.length >= MAX_SEGMENTS
                        ? t("limit", { count: MAX_SEGMENTS })
                        : t("dayFull")}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-[var(--space-4)]">
                <span className={LABEL_CLASS}>{t("remind")}</span>
                <select
                  data-testid="schedule-remind"
                  aria-label={t("remind")}
                  className={`${SELECT_CLASS} w-fit`}
                  style={SELECT_ARROW_SMALL}
                  value={remind === undefined ? "" : String(remind)}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                    const raw = event.target.value;
                    // «Молчать» — это отсутствие значения, а не ноль: два способа записать
                    // одно состояние расходятся молча (D068).
                    setRemind(raw === "" ? undefined : Number(raw));
                  }}
                >
                  <option value="">{t("remindSilent")}</option>
                  {REMIND_OPTIONS.map((minutes) => (
                    <option key={minutes} value={String(minutes)}>
                      {t("remindEvery", { count: minutes })}
                    </option>
                  ))}
                </select>
                {schedule.length === 0 ? (
                  <span className={HINT_CLASS}>{t("remindNeedsSchedule")}</span>
                ) : null}
              </div>
            </div>

            <div className={DIALOG_FOOT_CLASS}>
              {/* Подпись про Esc — слот подвала эталона (`.dialog__esc`), и она здесь
                  не для красоты: Esc окно действительно закрывает, а до T196 об этом
                  знал только тот, кто попробовал. */}
              <span className={DIALOG_ESC_CLASS}>{t("escHint")}</span>
              <div className="flex-1" />
              <button
                type="button"
                data-testid="schedule-cancel"
                className={GHOST_BUTTON_CLASS}
                onClick={() => {
                  setOpen(false);
                }}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                data-testid="schedule-apply-section"
                className={BUTTON_CLASS}
                disabled={broken}
                onClick={() => {
                  apply(true);
                }}
              >
                {t("applyToSection")}
              </button>
              <button
                type="button"
                data-testid="schedule-apply"
                className={PRIMARY_BUTTON_CLASS}
                disabled={broken}
                onClick={() => {
                  apply(false);
                }}
              >
                {t("apply")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
