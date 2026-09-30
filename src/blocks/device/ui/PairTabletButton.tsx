"use client";

// Кнопка выпуска пина и сам код рядом с ней — с обратным отсчётом и отказом по причине.
//
// Код живёт в состоянии компонента, а не в адресе — в отличие от окон подтверждения
// продукта (`core/ui/ConfirmDialog.tsx`). Причина в экранах: редактор чек-листа держит
// НЕСОХРАНЁННЫЙ черновик в состоянии, и смена адреса ради кода снесла бы правки
// управляющего вместе с ним. Цена решения — код исчезает при обновлении страницы,
// но он и живёт пять минут, а выпустить новый стоит одно нажатие.
//
// Слова берутся из клиентского словаря (`device.issue`): отсчёт склоняется и меняется
// каждую секунду, собрать его заранее на сервере нельзя. Раздел словаря передаёт
// провайдером тот, кто рисует кнопку (`PairTabletCard.tsx`).
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import type { ReactElement } from "react";

import type { IssueFailure } from "../issue-failure";
import type { IssuePinOutcome } from "./issue-pin-action";

const MILLISECONDS = 1000;
const SECONDS_IN_MINUTE = 60;
const TICK_MS = 1000;

const BUTTON_CLASS =
  "bg-surface text-ink flex h-[var(--control-h-sm)] w-full cursor-pointer items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-45";
// Код читают с экрана кабинета и набирают на планшете — поэтому он крупный, цифрами
// табличной ширины и с разрядкой: четыре цифры подряд иначе слипаются в одно число.
const CODE_CLASS =
  "text-ink text-center font-[family-name:var(--font-num)] text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold tracking-[0.2em] tabular-nums";
const EXPIRED_CODE_CLASS = `${CODE_CLASS} text-[var(--ink-3)] line-through`;
const HINT_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const LEFT_CLASS =
  "text-center text-[length:var(--fs-dense)] font-medium tabular-nums text-[var(--ink-2)]";
const FAILED_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--err)]";

/**
 * Почему нет кода: причина с сервера (#162), предел выпуска на учётку (#144) или обрыв
 * связи до сервера.
 */
type Failure = IssueFailure | "tooOften" | "offline";

interface Issued {
  readonly code: string;
  readonly minutes: number;
  readonly expiresAt: number;
}

/** «4:07» — сколько осталось; минуты без ведущего нуля, секунды с ним. */
function clock(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_IN_MINUTE);
  const rest = String(seconds % SECONDS_IN_MINUTE).padStart(2, "0");
  return `${String(minutes)}:${rest}`;
}

/** Секунд до конца срока, не меньше нуля; перерисовка раз в секунду, пока код жив. */
function useSecondsLeft(expiresAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [expiresAt]);

  if (expiresAt === null) return null;
  return Math.max(0, Math.ceil((expiresAt - now) / MILLISECONDS));
}

export function PairTabletButton({
  issue,
  address,
}: {
  /**
   * Серверное действие с уже привязанной станцией. Функция от сервера клиенту
   * передаётся ТОЛЬКО так — серверным действием; обычную функцию React отказался бы
   * сериализовать, и экран упал бы на отрисовке.
   */
  readonly issue: () => Promise<IssuePinOutcome>;
  /** Что набрать на планшете: полный адрес страницы привязки или хотя бы её путь. */
  readonly address: string;
}): ReactElement {
  const t = useTranslations("device.issue");
  const [issued, setIssued] = useState<Issued | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  // Через сколько минут выпуск снова пустит — только для отказа «слишком часто».
  const [waitMinutes, setWaitMinutes] = useState(0);
  const [pending, startIssuing] = useTransition();
  const left = useSecondsLeft(issued?.expiresAt ?? null);
  const expired = left === 0;

  function press(): void {
    startIssuing(async () => {
      try {
        const outcome = await issue();
        if (outcome.kind === "issued") {
          setIssued({
            code: outcome.code,
            minutes: outcome.minutes,
            expiresAt: Date.parse(outcome.expiresAt),
          });
          setFailure(null);
        } else if (outcome.kind === "tooOften") {
          setIssued(null);
          setWaitMinutes(outcome.minutes);
          setFailure("tooOften");
        } else {
          setIssued(null);
          setFailure(outcome.reason);
        }
      } catch {
        // Действие не дошло до сервера или ответ не вернулся. Причину на сервере мы не
        // знаем, и выдавать это за поломку базы нельзя — это связь этого устройства.
        setIssued(null);
        setFailure("offline");
      }
    });
  }

  return (
    <div className="flex flex-col gap-[var(--space-5)]">
      {issued === null ? null : (
        <div className="flex flex-col gap-[var(--space-4)]">
          <div
            data-testid="pair-tablet-code"
            data-expired={expired ? "true" : "false"}
            className={expired ? EXPIRED_CODE_CLASS : CODE_CLASS}
          >
            {issued.code}
          </div>
          <p
            className={LEFT_CLASS}
            data-testid="pair-tablet-left"
            aria-live="polite"
          >
            {expired ? t("expired") : t("left", { time: clock(left ?? 0) })}
          </p>
          <p className={HINT_CLASS}>{t("hint", { minutes: issued.minutes })}</p>
          <p className={HINT_CLASS} data-testid="pair-tablet-where">
            {t("where", { address })}
          </p>
        </div>
      )}

      {failure === null ? null : (
        <p
          data-testid="pair-tablet-failed"
          data-reason={failure}
          role="alert"
          className={FAILED_CLASS}
        >
          {t(`failed.${failure}`, { minutes: waitMinutes })}
        </p>
      )}

      <button
        type="button"
        data-testid="pair-tablet"
        className={BUTTON_CLASS}
        onClick={press}
        disabled={pending}
      >
        {issued === null ? t("action") : t("again")}
      </button>
    </div>
  );
}
