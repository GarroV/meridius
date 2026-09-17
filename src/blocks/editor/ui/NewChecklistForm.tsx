"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ReactElement } from "react";

import { useLive } from "@/blocks/core/ui/use-live";

import { submitCreateChecklist } from "../actions";
import { INITIAL_EDITOR_STATE } from "../action-state";
import type { StationOption } from "../listing";
import { CHECKLISTS_PATH } from "../routes";
import type { EditorErrorCode } from "../validation";
import {
  WINDOW_FIELD,
  WINDOW_FROM_FIELD,
  WINDOW_PRESETS,
  WINDOW_TO_FIELD,
  windowFieldValue,
} from "../window-field";

/**
 * Форма заведения чек-листа (карточка «Свойства чек-листа» из эталона `editor.html`).
 * Клиентский компонент — под `useActionState`, как `auth/ui/LoginForm.tsx` — и по той
 * же причине переводит не он сам: провайдера next-intl в разметке нет, поэтому весь
 * текст приходит уже переведённым пропом `labels` со страницы (серверного компонента).
 */

// Окно, с которым форма открывается. Сами окна общие с экраном правки и лежат
// в `window-field.ts`: два списка одних и тех же смен разъехались бы бесшумно.
const DEFAULT_WINDOW = windowFieldValue(WINDOW_PRESETS[0].value);

/** Тексты формы, переведённые заранее на странице (см. комментарий выше). */
export interface NewChecklistLabels {
  readonly title: string;
  readonly titlePlaceholder: string;
  readonly station: string;
  readonly noStation: string;
  readonly window: string;
  readonly windowMorning: string;
  readonly windowEvening: string;
  readonly windowAny: string;
  readonly windowOwn: string;
  readonly windowOwnFrom: string;
  readonly windowOwnTo: string;
  readonly windowOwnHint: string;
  readonly create: string;
  readonly cancel: string;
  /** Отказы, которых ждём от `submitCreateChecklist`; `{limit}` в них уже подставлен. */
  readonly errors: Partial<Record<EditorErrorCode | "unknown", string>> & {
    readonly unknown: string;
  };
}

export interface NewChecklistFormProps {
  readonly stations: readonly StationOption[];
  /** Язык интерфейса — уходит в скрытое поле `locale`: на нём хранится название чек-листа. */
  readonly locale: string;
  readonly labels: NewChecklistLabels;
}

const FIELD_LABEL_CLASS =
  "text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const CONTROL_CLASS =
  "text-ink bg-surface h-[var(--control-h)] w-full rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-lead)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const CARD_CLASS =
  "bg-surface max-w-[880px] rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
// Поля становятся в строку, пока строка их вмещает, и переносятся, когда нет: у каждого
// поля есть своя ширина (`basis`), иначе `flex-1` с нулевой основой не переносит НИКОГДА
// и три поля делят между собой хоть 60 точек. `min-w-0` при этом обязателен — без него
// поле, оставшееся на строке одно, не сжимается до ширины телефона и тащит форму вбок.
const ROW_CLASS =
  "flex flex-wrap gap-[var(--space-6)] [&>*]:min-w-0 [&>*]:flex-1 [&>*]:basis-[220px]";
const TIME_CLASS =
  "text-ink bg-surface h-[var(--control-h)] min-w-0 flex-1 rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-4)] font-[family-name:var(--font-num)] text-[length:var(--fs-body)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const HINT_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const FIELD_CLASS = "flex flex-col gap-[var(--space-3)]";
const BTN_PRIMARY_CLASS =
  "bg-accent inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60";
const BTN_GHOST_CLASS =
  "inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";
const ERROR_CLASS =
  "text-err m-0 rounded-[var(--r-control)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-5)] py-[var(--space-4)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";

export function NewChecklistForm({
  stations,
  locale,
  labels,
}: NewChecklistFormProps): ReactElement {
  const [state, action, pending] = useActionState(
    submitCreateChecklist,
    INITIAL_EDITOR_STATE,
  );
  const live = useLive();

  const errorMessage =
    state.status === "failed"
      ? (labels.errors[state.errorCode ?? "unknown"] ?? labels.errors.unknown)
      : null;

  return (
    <form
      action={action}
      data-testid="new-checklist-form"
      className={CARD_CLASS}
    >
      <div className="flex flex-col gap-[var(--space-6)] p-[var(--space-7)]">
        {errorMessage !== null ? (
          <p role="alert" data-testid="editor-error" className={ERROR_CLASS}>
            {errorMessage}
          </p>
        ) : null}

        <div className={ROW_CLASS}>
          <div className={FIELD_CLASS}>
            <label className={FIELD_LABEL_CLASS} htmlFor="new-checklist-title">
              {labels.title}
            </label>
            <input
              id="new-checklist-title"
              data-testid="new-checklist-title"
              name="title"
              type="text"
              required
              autoFocus
              placeholder={labels.titlePlaceholder}
              className={CONTROL_CLASS}
            />
          </div>

          <div className={FIELD_CLASS}>
            <label
              className={FIELD_LABEL_CLASS}
              htmlFor="new-checklist-station"
            >
              {labels.station}
            </label>
            <select
              id="new-checklist-station"
              name="stationId"
              defaultValue=""
              className={CONTROL_CLASS}
            >
              <option value="">{labels.noStation}</option>
              {stations.map((stationOption) => (
                <option key={stationOption.id} value={stationOption.id}>
                  {`${stationOption.countryName} · ${stationOption.storeName} · ${stationOption.name}`}
                </option>
              ))}
            </select>
          </div>

          <div className={FIELD_CLASS}>
            <label className={FIELD_LABEL_CLASS} htmlFor="new-checklist-window">
              {labels.window}
            </label>
            {/*
              Список отправляет выбранное окно САМ — своим `name`, а не копией выбора
              в состоянии React. Копия отставала: выбор, сделанный до того как экран
              ожил, в неё не попадал, и чек-лист заводился на утро при выбранном вечере
              (T129). Отсюда же отсутствие обработчика: состояния, которое он бы вёл,
              здесь больше нет — значит, и отставать больше нечему.
            */}
            <select
              id="new-checklist-window"
              name={WINDOW_FIELD}
              defaultValue={DEFAULT_WINDOW}
              className={CONTROL_CLASS}
            >
              {WINDOW_PRESETS.map((preset) => (
                <option
                  key={preset.labelKey}
                  value={windowFieldValue(preset.value)}
                >
                  {labels[preset.labelKey]}
                </option>
              ))}
            </select>

            {/*
              Своё окно временем (T185). Список — быстрый выбор трёх обычных смен, а не
              перечень всех: в боевых данных живут 05:00–17:00 и 06:00–23:00, и завести
              их руками было нечем. Поля настоящие и с именами, поэтому окно уезжает
              тем же способом, что и выбор списка, — без состояния React и без скриптов;
              заполненные обе границы сильнее списка (`windowFromFields`).
            */}
            <div className="flex flex-wrap items-center gap-[var(--space-4)]">
              <span className={HINT_CLASS}>{labels.windowOwn}</span>
              <input
                type="time"
                name={WINDOW_FROM_FIELD}
                data-testid="new-checklist-window-from"
                aria-label={labels.windowOwnFrom}
                className={TIME_CLASS}
              />
              <span className={HINT_CLASS}>–</span>
              <input
                type="time"
                name={WINDOW_TO_FIELD}
                data-testid="new-checklist-window-to"
                aria-label={labels.windowOwnTo}
                className={TIME_CLASS}
              />
            </div>
            <span className={HINT_CLASS}>{labels.windowOwnHint}</span>
          </div>
        </div>

        <input type="hidden" name="locale" value={locale} />

        <div className="flex flex-wrap items-center gap-[var(--space-5)]">
          {/*
            `data-live` — признак того, что форма ожила (`core/ui/use-live.tsx`). До гидратации
            кнопка выглядит рабочей и отправляет форму обычным способом браузера, и это
            законный путь: сохранение от скриптов не зависит. Но сценарию нужно уметь
            дождаться ИМЕННО второго пути отправки, иначе он проверит только первый.
          */}
          <button
            type="submit"
            disabled={pending}
            data-testid="create-checklist"
            data-live={live ? "true" : undefined}
            className={BTN_PRIMARY_CLASS}
          >
            {labels.create}
          </button>
          <Link href={CHECKLISTS_PATH} className={BTN_GHOST_CLASS}>
            {labels.cancel}
          </Link>
        </div>
      </div>
    </form>
  );
}
