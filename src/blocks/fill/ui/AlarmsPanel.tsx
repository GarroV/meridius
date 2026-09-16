"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { ALARM_LIMITS } from "../alarm-limits";
import type { AlarmOutcome, AlarmView } from "../alarms";

/**
 * Будильники станции (D070).
 *
 * Сотрудник вручную вносит время и подпись — «вынести тесто в 14:30», — и планшет
 * в это время звонит. Регулярности здесь нет и не будет: это записка на сегодня.
 *
 * Отсчёт до звонка приходит с сервера в секундах, а не мигом времени: часы кухонного
 * планшета врут, и будильник, поставленный по ним, звонил бы не тогда, когда написано
 * на экране. Отрицательный отсчёт означает «время прошло, а будильник не сняли» — так
 * выглядит перезагрузка планшета, и такой будильник звонит сразу, как экран открылся.
 * Ради этого он и хранится строкой в базе.
 *
 * Про звук здесь сказано вслух: он работает, пока экран открыт. Умолчать об этом —
 * значит дать обещание, которого продукт не держит, а планшет на кухне гасят.
 */

const MINUTE_SECONDS = 60;
const MS = 1000;
/** Три коротких гудка: узнаваемо и не пугает кухню. */
const BEEPS = 3;
const BEEP_SECONDS = 0.18;
const BEEP_GAP_SECONDS = 0.28;
const BEEP_HZ = 880;
const BEEP_GAIN = 0.12;

const PANEL_CLASS = "border-t-[6px] border-[var(--surface-3)]";
const HEAD_CLASS =
  "px-[var(--space-7)] pt-[var(--space-8)] pb-[var(--space-4)] text-[length:var(--fs-micro)] leading-[var(--lh-body)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const ROW_CLASS =
  "flex items-center gap-[var(--space-5)] border-t border-[var(--line)] px-[var(--space-7)] py-[var(--space-4)]";
const TIME_CLASS =
  "font-[family-name:var(--font-num)] text-[length:var(--fs-lead)] font-semibold";
const LABEL_CLASS =
  "flex-1 text-[length:var(--fs-lead)] leading-[21px] break-words";
const DROP_CLASS =
  "min-h-[var(--tap-min)] min-w-[var(--tap-min)] shrink-0 cursor-pointer rounded-[var(--r-control)] border border-[var(--line-control)] bg-surface text-[length:var(--fs-lead)] text-[var(--ink-3)] transition-colors hover:border-[var(--accent-line)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-default disabled:opacity-60";
// Заведение идёт двумя строками, а не одной: на 375 px «время + подпись + кнопка»
// в строку не помещаются, и подпись сжимается до полутора слов — подсказка обрывается
// на середине. Подпись — главное поле, ей отдана вся ширина; время и кнопка короткие
// и стоят вторым рядом.
const FORM_CLASS =
  "flex flex-col gap-[var(--space-4)] border-t border-[var(--line)] px-[var(--space-7)] py-[var(--space-5)]";
const FORM_ROW_CLASS = "flex items-center gap-[var(--space-4)]";
const INPUT_CLASS =
  "min-h-[var(--tap-min)] rounded-[var(--r-control)] border border-[var(--line-control)] bg-surface px-[var(--space-5)] text-[length:var(--fs-lead)] text-ink focus:border-[var(--accent)] focus:outline-none";
const BUTTON_CLASS =
  "min-h-[var(--tap-min)] cursor-pointer rounded-[var(--r-control)] border border-[var(--accent)] bg-surface px-[var(--space-6)] text-[length:var(--fs-lead)] text-[var(--accent)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-default disabled:opacity-60";
const HINT_CLASS =
  "px-[var(--space-7)] pb-[var(--space-6)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const NOTICE_CLASS =
  "mx-[var(--space-7)] mb-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-6)] py-[var(--space-5)] text-[length:var(--fs-dense)] text-[var(--err)]";
const RINGING_CLASS =
  "mx-[var(--space-7)] mt-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--warn-line)] bg-[var(--warn-soft)] px-[var(--space-6)] py-[var(--space-5)] text-[var(--warn-ink)]";
const RINGING_ROW_CLASS =
  "mt-[var(--space-4)] flex flex-wrap items-center gap-[var(--space-4)]";

export interface AlarmsPanelProps {
  readonly alarms: readonly AlarmView[];
  readonly code: string;
  /**
   * Действия передаются сверху, а не импортируются здесь: так панель проверяется
   * без серверной части — тем же приёмом, что `FillForm` и `RoundsPanel`.
   */
  readonly add: (input: unknown) => Promise<AlarmOutcome>;
  readonly drop: (input: unknown) => Promise<AlarmOutcome>;
}

/**
 * Гудок будильника.
 *
 * Звук может не пойти: браузер не даёт звучать странице, на которой ещё никто ничего
 * не нажимал. Это не глотание ошибки — плашка звонящего будильника остаётся на экране
 * в любом случае, и именно она, а не звук, сообщает сотруднику о будильнике. Вернувшееся
 * `false` говорит панели, что звук не пошёл, и она пишет об этом прямо в плашке.
 */
async function beep(): Promise<boolean> {
  try {
    // Обращение внутри try намеренно: в среде без Web Audio это бросит, и ветка
    // «звука нет» одна на оба случая — нет поддержки и не дали звучать.
    const ctx = new globalThis.AudioContext();
    // Состояние спрашивается ПОСЛЕ того, как разрешение доиграно: сразу после вызова
    // оно ещё «suspended» всегда, и панель писала бы «звука нет» даже там, где звук
    // пошёл. Надпись, которая врёт в половине случаев, учит не читать панель вовсе.
    await ctx.resume();
    if (ctx.state !== "running") return false;

    for (let index = 0; index < BEEPS; index++) {
      const start = ctx.currentTime + index * BEEP_GAP_SECONDS;
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      tone.frequency.value = BEEP_HZ;
      gain.gain.value = BEEP_GAIN;
      tone.connect(gain).connect(ctx.destination);
      tone.start(start);
      tone.stop(start + BEEP_SECONDS);
    }
    return true;
  } catch {
    return false;
  }
}

export function AlarmsPanel({
  alarms,
  code,
  add,
  drop,
}: AlarmsPanelProps): ReactElement {
  const t = useTranslations("fill.alarms");
  const [list, setList] = useState<readonly AlarmView[]>(alarms);
  const [time, setTime] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ringing, setRinging] = useState<readonly string[]>([]);
  const [silent, setSilent] = useState(false);
  // Уже прозвонившие: второй раз в ту же загрузку экрана будильник не звенит.
  const rung = useRef<Set<string>>(new Set());

  // Список приходит с сервера: он же и есть состояние панели. Своего представления
  // о том, что там теперь, панель не держит — на станции может стоять второй планшет.
  useEffect(() => {
    setList(alarms);
  }, [alarms]);

  useEffect(() => {
    const timers = list.map((alarm) => {
      if (rung.current.has(alarm.id)) return null;
      const delay = Math.max(0, alarm.ringsInSeconds * MS);
      return globalThis.setTimeout(() => {
        rung.current.add(alarm.id);
        setRinging((current) =>
          current.includes(alarm.id) ? current : [...current, alarm.id],
        );
        void beep().then((sounded) => {
          if (!sounded) setSilent(true);
        });
      }, delay);
    });

    return () => {
      for (const timer of timers) {
        if (timer !== null) globalThis.clearTimeout(timer);
      }
    };
  }, [list]);

  const apply = useCallback(
    async (action: () => Promise<AlarmOutcome>, alarmId?: string) => {
      setBusy(true);
      setNotice(null);
      try {
        const outcome = await action();
        if (outcome.kind === "alarms") {
          setList(outcome.alarms);
          if (alarmId !== undefined) {
            setRinging((current) => current.filter((id) => id !== alarmId));
          }
          return true;
        }
        setNotice(
          outcome.reason === "rate-limited"
            ? t("refused.tooOften", {
                minutes: Math.max(
                  1,
                  Math.ceil(outcome.retryAfterSeconds / MINUTE_SECONDS),
                ),
              })
            : outcome.reason === "past-time"
              ? t("refused.pastTime")
              : outcome.reason === "too-many"
                ? t("refused.tooMany", {
                    count: ALARM_LIMITS.maxPerStationPerDay,
                  })
                : t("refused.broken"),
        );
        return false;
      } catch {
        // Связь оборвалась. Введённое остаётся на экране, и касание можно повторить.
        setNotice(t("refused.offline"));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const ringingAlarms = list.filter((alarm) => ringing.includes(alarm.id));

  return (
    <section data-testid="alarms-panel" className={PANEL_CLASS}>
      <h2 className={HEAD_CLASS}>{t("title")}</h2>

      {ringingAlarms.map((alarm) => (
        <div
          key={`ringing-${alarm.id}`}
          data-testid={`alarm-ringing-${alarm.id}`}
          role="alert"
          className={RINGING_CLASS}
        >
          <div className="text-[length:var(--fs-lead)] font-semibold">
            {t("ringing", { time: alarm.atLocalTime })}
          </div>
          <div className="mt-[var(--space-2)] text-[length:var(--fs-lead)]">
            {alarm.label}
          </div>
          {silent ? (
            <div className="mt-[var(--space-2)] text-[length:var(--fs-meta)]">
              {t("noSound")}
            </div>
          ) : null}
          <div className={RINGING_ROW_CLASS}>
            <button
              type="button"
              data-testid={`alarm-ack-${alarm.id}`}
              className={BUTTON_CLASS}
              disabled={busy}
              onClick={() => {
                void apply(() => drop({ code, alarmId: alarm.id }), alarm.id);
              }}
            >
              {t("acknowledge")}
            </button>
          </div>
        </div>
      ))}

      {list.map((alarm) => (
        <div
          key={alarm.id}
          data-testid={`alarm-${alarm.id}`}
          className={ROW_CLASS}
        >
          <span className={TIME_CLASS}>{alarm.atLocalTime}</span>
          <span className={LABEL_CLASS}>{alarm.label}</span>
          <button
            type="button"
            data-testid={`alarm-drop-${alarm.id}`}
            className={DROP_CLASS}
            aria-label={t("drop", { label: alarm.label })}
            disabled={busy}
            onClick={() => {
              void apply(() => drop({ code, alarmId: alarm.id }), alarm.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}

      <div className={FORM_CLASS}>
        <label className="sr-only" htmlFor="alarm-label">
          {t("labelLabel")}
        </label>
        <input
          id="alarm-label"
          data-testid="alarm-label"
          className={`${INPUT_CLASS} w-full`}
          maxLength={ALARM_LIMITS.maxLabelLength}
          placeholder={t("labelPlaceholder")}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
        />
        <div className={FORM_ROW_CLASS}>
          <label className="sr-only" htmlFor="alarm-time">
            {t("timeLabel")}
          </label>
          <input
            id="alarm-time"
            data-testid="alarm-time"
            type="time"
            className={`${INPUT_CLASS} w-[8rem] shrink-0`}
            value={time}
            onChange={(event) => {
              setTime(event.target.value);
            }}
          />
          <button
            type="button"
            data-testid="alarm-add"
            className={`${BUTTON_CLASS} flex-1`}
            disabled={busy || time === "" || label.trim() === ""}
            onClick={() => {
              void apply(() =>
                add({ code, atLocalTime: time, label: label.trim() }),
              ).then((ok) => {
                if (!ok) return;
                setTime("");
                setLabel("");
              });
            }}
          >
            {t("add")}
          </button>
        </div>
      </div>

      {notice === null ? null : (
        <div data-testid="alarm-notice" role="alert" className={NOTICE_CLASS}>
          {notice}
        </div>
      )}

      <p className={HINT_CLASS}>{t("hint")}</p>
    </section>
  );
}
