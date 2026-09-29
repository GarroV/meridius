"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { ALARM_LIMITS } from "../alarm-limits";
import type { AlarmOutcome, AlarmView } from "../alarms";
import type { FillAlarmView } from "../model";
import { formatStationTime } from "../station-time";
import { alarmRefusalText } from "./alarm-refusal";

/**
 * Пункт-будильник чек-листа на станции (D156, user-flow §8.2).
 *
 * Не галочка, а кнопка «Поставить будильник» с подставленными подписью и временем:
 * составитель заранее заложил, что здесь понадобится будильник, а сотрудник может
 * поправить и то и другое перед тем, как поставить. Поставил — пункт закрыт, будильник
 * в панели станции рядом с ручными (D070): ставится тем же действием и звонит тем же
 * механизмом — по серверному отсчёту, а не по часам планшета.
 *
 * Время «через N минут» считается от СЕРВЕРНОГО «сейчас» на момент выдачи экрана плюс
 * прошедшее с тех пор по монотонным часам вкладки: часы планшета врут, а прошедший
 * промежуток они меряют верно. Подставленное освежается раз в полминуты, пока его не
 * правили руками, — иначе экран, провисевший час, предлагал бы уже прошедшее время.
 */

const MINUTE_MS = 60_000;
const REFRESH_MS = 30_000;

const WRAP_CLASS =
  "mx-[var(--space-7)] mb-[var(--space-6)] flex flex-col gap-[var(--space-4)]";
const ROW_CLASS = "flex flex-wrap items-end gap-[var(--space-4)]";
const FIELD_CLASS = "flex flex-col gap-[var(--space-3)]";
const FIELD_LABEL_CLASS =
  "text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const INPUT_CLASS =
  "min-h-[var(--tap-min)] rounded-[var(--r-control)] border border-[var(--line-control)] bg-surface px-[var(--space-5)] text-[length:var(--fs-lead)] text-ink focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const BUTTON_CLASS =
  "min-h-[var(--tap-min)] cursor-pointer rounded-[var(--r-control)] border border-[var(--accent)] bg-surface px-[var(--space-6)] text-[length:var(--fs-lead)] text-[var(--accent)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45";
const NOTICE_CLASS =
  "rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-6)] py-[var(--space-5)] text-[length:var(--fs-dense)] text-[var(--err)]";
const SET_CLASS = "text-[length:var(--fs-dense)] text-[var(--ink-2)]";

export interface AlarmItemProps {
  readonly itemId: string;
  readonly title: string;
  readonly alarm: FillAlarmView;
  readonly code: string;
  /** Время, на которое будильник уже поставлен этим пунктом; `null` — ещё нет. */
  readonly setAt: string | null;
  /** Серверное «сейчас» на момент выдачи экрана, мс. */
  readonly serverNow: number;
  readonly timeZone: string;
  readonly add: (input: unknown) => Promise<AlarmOutcome>;
  /** Будильник поставлен: пункт закрывается, список станции — тот, что вернул сервер. */
  readonly onSet: (time: string, alarms: readonly AlarmView[]) => void;
}

/** Час, который подставляет пункт: заданный составителем или «сейчас + отсрочка». */
function suggestedTime(
  alarm: FillAlarmView,
  now: number,
  timeZone: string,
): string {
  if (alarm.at !== null) return alarm.at;
  return formatStationTime(
    now + (alarm.afterMinutes ?? 0) * MINUTE_MS,
    timeZone,
    "en",
  );
}

export function AlarmItem({
  itemId,
  title,
  alarm,
  code,
  setAt,
  serverNow,
  timeZone,
  add,
  onSet,
}: AlarmItemProps): ReactElement {
  const t = useTranslations("fill.alarms");
  const openedAt = useRef<number | null>(null);
  const [now, setNow] = useState(serverNow);
  const [time, setTime] = useState<string | null>(null);
  const [label, setLabel] = useState(alarm.label);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Отсчёт идёт от серверного «сейчас»: монотонные часы вкладки меряют только прошедшее.
  useEffect(() => {
    if (alarm.at !== null) return;
    openedAt.current ??= performance.now();
    const timer = setInterval(() => {
      setNow(serverNow + performance.now() - (openedAt.current ?? 0));
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [alarm.at, serverNow]);

  if (setAt !== null) {
    return (
      <p
        data-testid="fill-alarm-set"
        data-item-id={itemId}
        className={`mx-[var(--space-7)] mb-[var(--space-6)] ${SET_CLASS}`}
      >
        {t("itemSet", { time: setAt })}
      </p>
    );
  }

  const shown = time ?? suggestedTime(alarm, now, timeZone);

  async function place(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await add({
        code,
        atLocalTime: shown,
        label: label.trim() === "" ? title : label,
      });
      if (outcome.kind === "alarms") {
        onSet(shown, outcome.alarms);
        return;
      }
      setNotice(alarmRefusalText(outcome, t));
    } catch {
      setNotice(t("refused.offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={WRAP_CLASS} data-testid="fill-alarm" data-item-id={itemId}>
      <div className={ROW_CLASS}>
        <label className={`${FIELD_CLASS} min-w-[180px] flex-1`}>
          <span className={FIELD_LABEL_CLASS}>{t("labelLabel")}</span>
          <input
            data-testid="fill-alarm-label"
            className={INPUT_CLASS}
            value={label}
            maxLength={ALARM_LIMITS.maxLabelLength}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
          />
        </label>
        <label className={FIELD_CLASS}>
          <span className={FIELD_LABEL_CLASS}>{t("timeLabel")}</span>
          <input
            type="time"
            data-testid="fill-alarm-time"
            className={INPUT_CLASS}
            value={shown}
            onChange={(event) => {
              setTime(event.target.value);
            }}
          />
        </label>
        <button
          type="button"
          data-testid="fill-alarm-set-button"
          className={BUTTON_CLASS}
          disabled={busy || shown === ""}
          onClick={() => {
            void place();
          }}
        >
          {t("itemAdd")}
        </button>
      </div>
      {notice === null ? null : (
        <p
          role="alert"
          data-testid="fill-alarm-notice"
          className={NOTICE_CLASS}
        >
          {notice}
        </p>
      )}
    </div>
  );
}
