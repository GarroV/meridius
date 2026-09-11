"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";

import { submitCreateChecklist } from "../actions";
import { INITIAL_EDITOR_STATE } from "../action-state";
import type { StationOption } from "../listing";
import { CHECKLISTS_PATH } from "../routes";
import type { EditorErrorCode } from "../validation";

/**
 * Форма заведения чек-листа (карточка «Свойства чек-листа» из эталона `editor.html`).
 * Клиентский компонент — под `useActionState`, как `auth/ui/LoginForm.tsx` — и по той
 * же причине переводит не он сам: провайдера next-intl в разметке нет, поэтому весь
 * текст приходит уже переведённым пропом `labels` со страницы (серверного компонента).
 */

// Три готовых окна эталона: произвольное время форма не даёт — на экране заведения
// нужны ровно эти случаи, а не конструктор времени (правка окна — в редакторе).
const WINDOW_PRESETS = [
  { key: "morning", start: "06:00", end: "11:00" },
  { key: "evening", start: "20:00", end: "00:00" },
  { key: "any", start: "00:00", end: "24:00" },
] as const;

type WindowKey = (typeof WINDOW_PRESETS)[number]["key"];

function isWindowKey(value: string): value is WindowKey {
  return WINDOW_PRESETS.some((preset) => preset.key === value);
}

function presetByKey(key: WindowKey) {
  // Список исчерпывающий и статический — найдётся всегда; find не может не найти,
  // это защита типов на случай будущей правки массива, а не путь исполнения.
  const preset = WINDOW_PRESETS.find((item) => item.key === key);
  if (preset === undefined) throw new Error(`Неизвестное окно: ${key}`);
  return preset;
}

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
const ROW_CLASS = "flex gap-[var(--space-6)] [&>*]:min-w-0 [&>*]:flex-1";
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
  const [windowKey, setWindowKey] = useState<WindowKey>("morning");
  const preset = presetByKey(windowKey);

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
            <select
              id="new-checklist-window"
              className={CONTROL_CLASS}
              value={windowKey}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                const { value } = event.target;
                if (isWindowKey(value)) setWindowKey(value);
              }}
            >
              <option value="morning">{labels.windowMorning}</option>
              <option value="evening">{labels.windowEvening}</option>
              <option value="any">{labels.windowAny}</option>
            </select>
          </div>
        </div>

        <input type="hidden" name="windowStart" value={preset.start} />
        <input type="hidden" name="windowEnd" value={preset.end} />
        <input type="hidden" name="locale" value={locale} />

        <div className="flex items-center gap-[var(--space-5)]">
          <button
            type="submit"
            disabled={pending}
            data-testid="create-checklist"
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
