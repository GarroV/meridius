import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ChangeEvent } from "react";

import type { Item, ItemAlarm } from "@/blocks/data";

import {
  ALARM_TIME_PATTERN,
  DEFAULT_ALARM_DELAY_MINUTES,
  MAX_ALARM_DELAY_MINUTES,
} from "../alarm-field";
import { pickEditorText } from "../localized-text";

/**
 * Будильник пункта под его строкой в редакторе (D156, user-flow §8.1): подпись по
 * умолчанию и КОГДА — в час или через сколько минут от момента, когда пункт открыли.
 * На станции это станет кнопкой «Поставить будильник» с подставленными подписью и
 * временем; сотрудник может поправить и то и другое.
 *
 * Отдельной панелью, как колонки таблицы: у будильника три поля, и в строку пункта
 * рядом с типом и уровнем они не помещаются.
 */
export interface AlarmFieldsProps {
  readonly item: Item;
  readonly locale: string;
  readonly onChange: (alarm: ItemAlarm) => void;
}

type AlarmMode = "at" | "after";

const PANEL_CLASS =
  "flex flex-wrap items-end gap-[var(--space-5)] border-b border-[var(--line)] py-[var(--space-4)] pr-[var(--space-6)] pl-[calc(28px+var(--space-5)+var(--space-6))]";
const FIELD_CLASS = "flex flex-col gap-[var(--space-2)]";
const LABEL_CLASS =
  "text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const INPUT_CLASS =
  "text-ink bg-surface h-[var(--control-h-sm)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-4)] text-[length:var(--fs-dense)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const NUMBER_CLASS = `${INPUT_CLASS} w-[80px] text-center font-[family-name:var(--font-num)]`;

/** Час, который поле предлагает при переключении на «в»: утро смены, а не полночь. */
const DEFAULT_ALARM_TIME = "10:00";

function modeOf(alarm: ItemAlarm | undefined): AlarmMode {
  return alarm?.at === undefined ? "after" : "at";
}

/** Отсрочка из поля: целые минуты в пределах, иначе `undefined` — ещё печатают. */
function parseDelay(raw: string): number | undefined {
  if (!/^\d{1,4}$/.test(raw)) return undefined;
  const minutes = Number(raw);
  return minutes >= 1 && minutes <= MAX_ALARM_DELAY_MINUTES
    ? minutes
    : undefined;
}

export function AlarmFields({ item, locale, onChange }: AlarmFieldsProps) {
  const t = useTranslations("editor.alarm");
  const alarm = item.alarm;
  const mode = modeOf(alarm);
  const label = alarm?.label;
  const withLabel = label === undefined ? {} : { label };
  // Черновик минут живёт в поле: пока человек стирает «30», чтобы вписать «45», пустое
  // поле не должно ни уехать в разметку, ни вернуться обратно «30» под курсором.
  const [delayRaw, setDelayRaw] = useState(() =>
    String(alarm?.afterMinutes ?? DEFAULT_ALARM_DELAY_MINUTES),
  );

  return (
    <div data-testid="item-alarm" className={PANEL_CLASS}>
      <label className={`${FIELD_CLASS} min-w-[200px] flex-1`}>
        <span className={LABEL_CLASS}>{t("label")}</span>
        <input
          data-testid="item-alarm-label"
          className={INPUT_CLASS}
          placeholder={t("labelPlaceholder")}
          value={pickEditorText(label, locale)}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            onChange({
              ...alarm,
              label: { ...label, [locale]: event.target.value },
            });
          }}
        />
      </label>

      <label className={FIELD_CLASS}>
        <span className={LABEL_CLASS}>{t("when")}</span>
        <select
          data-testid="item-alarm-mode"
          className={INPUT_CLASS}
          value={mode}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            if (event.target.value === "at") {
              onChange({ ...withLabel, at: DEFAULT_ALARM_TIME });
              return;
            }
            setDelayRaw(String(DEFAULT_ALARM_DELAY_MINUTES));
            onChange({
              ...withLabel,
              afterMinutes: DEFAULT_ALARM_DELAY_MINUTES,
            });
          }}
        >
          <option value="after">{t("modeAfter")}</option>
          <option value="at">{t("modeAt")}</option>
        </select>
      </label>

      {mode === "at" ? (
        <label className={FIELD_CLASS}>
          <span className={LABEL_CLASS}>{t("at")}</span>
          <input
            type="time"
            data-testid="item-alarm-at"
            className={INPUT_CLASS}
            value={alarm?.at ?? DEFAULT_ALARM_TIME}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              // Пустое или недописанное время в разметку не едет: разбор его отверг бы,
              // и методист узнал бы об этом только на «Сохранить».
              if (!ALARM_TIME_PATTERN.test(event.target.value)) return;
              onChange({ ...withLabel, at: event.target.value });
            }}
          />
        </label>
      ) : (
        <label className={FIELD_CLASS}>
          <span className={LABEL_CLASS}>{t("after")}</span>
          <span className="flex items-center gap-[var(--space-3)] text-[length:var(--fs-meta)] text-[var(--ink-3)]">
            <input
              data-testid="item-alarm-after"
              className={NUMBER_CLASS}
              inputMode="numeric"
              value={delayRaw}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setDelayRaw(event.target.value);
                const minutes = parseDelay(event.target.value);
                if (minutes !== undefined) {
                  onChange({ ...withLabel, afterMinutes: minutes });
                }
              }}
            />
            {t("minutes")}
          </span>
        </label>
      )}
    </div>
  );
}
