import { useTranslations } from "next-intl";
import type { ChangeEvent } from "react";

import type { StationOption } from "../listing";
import type { WindowValue } from "../window-field";
import {
  WINDOW_PRESETS,
  parseWindowField,
  windowFieldValue,
} from "../window-field";
import { SELECT_ARROW } from "./select-style";

const FIELD_LABEL_CLASS =
  "text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const CONTROL_CLASS =
  "text-ink bg-surface h-[var(--control-h)] w-full rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-lead)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const TIME_CLASS =
  "text-ink bg-surface h-[var(--control-h)] min-w-0 flex-1 rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-4)] font-[family-name:var(--font-num)] text-[length:var(--fs-body)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const HINT_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const BOUND_CLASS =
  "flex min-w-0 flex-1 basis-[132px] items-center gap-[var(--space-4)]";

/**
 * Свойства чек-листа: название, станция, окно.
 *
 * Окно задаётся двумя способами сразу, и это не дубль: список — быстрый выбор трёх
 * обычных смен станции, поля времени — своё окно для всего остального (T185; до него
 * 05:00–17:00 из боевых данных нельзя было ни завести, ни поправить). Уже записанное
 * нестандартное окно по-прежнему стоит в списке отдельным пунктом, чтобы открытие
 * чек-листа не переписало его молча.
 *
 * Здесь, в отличие от экрана заведения, источник один — состояние экрана: и список, и
 * поля времени зовут `onWindow`, а на сервер окно уезжает скрытым полем шапки. Правило
 * «своё сильнее списка» поэтому нужно только на заведении, где состояния нет вовсе.
 */
export function PropertiesCard({
  title,
  stationId,
  window,
  stations,
  onTitle,
  onStation,
  onWindow,
}: {
  readonly title: string;
  readonly stationId: string;
  readonly window: WindowValue;
  readonly stations: readonly StationOption[];
  readonly onTitle: (value: string) => void;
  readonly onStation: (value: string) => void;
  readonly onWindow: (value: WindowValue) => void;
}) {
  const t = useTranslations("editor.form");
  const current = windowFieldValue(window);
  const isPreset = WINDOW_PRESETS.some(
    (preset) => windowFieldValue(preset.value) === current,
  );

  return (
    <div className="bg-surface mb-[var(--space-8)] rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]">
      {/* Ниже складки три поля свойств встают столбиком: в строку они помещаются
        только обрезанными — «Открытие см…» вместо названия чек-листа. */}
      <div className="flex gap-[var(--space-6)] p-[var(--space-7)] max-md:flex-col">
        <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-3)]">
          <label className={FIELD_LABEL_CLASS} htmlFor="checklist-title">
            {t("title")}
          </label>
          <input
            id="checklist-title"
            data-testid="checklist-title"
            className={CONTROL_CLASS}
            value={title}
            placeholder={t("titlePlaceholder")}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              onTitle(event.target.value);
            }}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-3)]">
          <label className={FIELD_LABEL_CLASS} htmlFor="checklist-station">
            {t("station")}
          </label>
          <select
            id="checklist-station"
            data-testid="checklist-station"
            className={`${CONTROL_CLASS} pr-[var(--space-8)]`}
            style={SELECT_ARROW}
            value={stationId}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              onStation(event.target.value);
            }}
          >
            <option value="">{t("noStation")}</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {`${station.countryName} · ${station.storeName} · ${station.name}`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-3)]">
          <label className={FIELD_LABEL_CLASS} htmlFor="checklist-window">
            {t("window")}
          </label>
          <select
            id="checklist-window"
            data-testid="checklist-window"
            className={`${CONTROL_CLASS} pr-[var(--space-8)]`}
            style={SELECT_ARROW}
            value={current}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              onWindow(parseWindowField(event.target.value));
            }}
          >
            {WINDOW_PRESETS.map((preset) => (
              <option
                key={preset.labelKey}
                value={windowFieldValue(preset.value)}
              >
                {t(preset.labelKey)}
              </option>
            ))}
            {isPreset ? null : (
              <option value={current}>
                {t("windowCustom", { start: window.start, end: window.end })}
              </option>
            )}
          </select>

          <span className={FIELD_LABEL_CLASS}>{t("windowOwn")}</span>
          {/* Подпись своей строкой и границы словами — по той же причине, что на экране
              заведения: ряд «подпись + два поля времени» на 375 px рвался посередине. */}
          {/*
            Каждая граница — свой блок с собственной шириной, и переносится он целиком.
            Плоский ряд «от [поле] до [поле]» на узком экране рвался ПОСЕРЕДИНЕ, а поле,
            делившее строку с соседом, схлопывалось до значка часов: у `flex-1` основа
            нулевая, поэтому перенос не случался вовсе, а свободная ширина делилась
            между двумя полями пополам. Поймано сверкой снимков, дважды.
          */}
          <div className="flex flex-wrap items-center gap-x-[var(--space-4)] gap-y-[var(--space-3)]">
            <span className={BOUND_CLASS}>
              <span className={HINT_CLASS}>{t("windowOwnFromShort")}</span>
              <input
                type="time"
                data-testid="checklist-window-from"
                aria-label={t("windowOwnFrom")}
                className={TIME_CLASS}
                value={window.start}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  // Пустое значение приходит, пока время дописывается, — тот же случай,
                  // что у отрезков обхода: записать его значит стереть границу на
                  // середине набора.
                  if (event.target.value === "") return;
                  onWindow({ ...window, start: event.target.value });
                }}
              />
            </span>
            <span className={BOUND_CLASS}>
              <span className={HINT_CLASS}>{t("windowOwnToShort")}</span>
              <input
                type="time"
                data-testid="checklist-window-to"
                aria-label={t("windowOwnTo")}
                className={TIME_CLASS}
                value={window.end}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  if (event.target.value === "") return;
                  onWindow({ ...window, end: event.target.value });
                }}
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
