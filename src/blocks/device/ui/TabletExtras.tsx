"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { useScreenAwake } from "@/blocks/core/ui/use-screen-awake";
import { beep } from "@/blocks/fill/ui/beep";
import { startRefreshClock } from "@/blocks/fill/ui/refresh-clock";

/**
 * Поведение привязанной вкладки: часы перерисовки, удержание экрана и чип звука.
 *
 * Разметки почти нет — это поведение, а не экран, и живёт оно рядом с содержимым во всех
 * его состояниях: и когда чек-лист открыт, и когда «заполнять нечего». Вкладка висит
 * сутками, поэтому проснуться к границе окна она обязана в любом из них.
 */

const CHIP_CLASS =
  "fixed right-[var(--space-6)] bottom-[var(--space-6)] z-3 inline-flex min-h-[var(--tap-min)] cursor-pointer items-center gap-[var(--space-3)] rounded-[var(--r-pill)] border border-[var(--line-strong)] bg-surface px-[var(--space-6)] py-[var(--space-4)] text-[length:var(--fs-dense)] text-ink shadow-[var(--sh-pop)]";

/** Сколько держится подтверждение «звук включён», прежде чем чип уйдёт с экрана. */
const CONFIRMATION_MS = 3000;

export interface TabletSoundLabels {
  readonly enable: string;
  readonly enabled: string;
  readonly blocked: string;
}

export function TabletExtras({
  nextChangeInSeconds,
  sound,
}: {
  /** Через сколько секунд состояние сменится само; `null` — меняться нечему. */
  readonly nextChangeInSeconds: number | null;
  readonly sound: TabletSoundLabels;
}): ReactElement | null {
  const router = useRouter();
  useScreenAwake();

  // Свежая величина для часов держится в ref: часы спрашивают её сами перед каждым
  // взводом, а копия внутри часов стала бы вторым источником правды (см. refresh-clock).
  const nextChange = useRef(nextChangeInSeconds);
  useEffect(() => {
    nextChange.current = nextChangeInSeconds;
  }, [nextChangeInSeconds]);

  useEffect(
    () =>
      startRefreshClock({
        nextChangeInSeconds: () => nextChange.current,
        // Состояние считает сервер по местному времени пиццерии: спрашиваем его,
        // а не досчитываем во вкладке.
        onDue: () => {
          router.refresh();
        },
      }),
    [router],
  );

  const [state, setState] = useState<"off" | "on" | "blocked" | "done">("off");

  // Подтверждение звука держится несколько секунд и уходит: чип сделал своё дело, а
  // постоянная плашка на экране заполнения занимала бы место у пунктов чек-листа.
  useEffect(() => {
    if (state !== "on") return;
    const timer = setTimeout(() => {
      setState("done");
    }, CONFIRMATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [state]);

  if (state === "done") return null;

  return (
    <button
      type="button"
      data-testid="tablet-sound"
      data-state={state}
      className={CHIP_CLASS}
      onClick={() => {
        // Браузер не даёт звучать странице, на которой ещё никто ничего не нажимал.
        // Обойти правило нельзя, поэтому один тап и есть весь механизм: он же и
        // проверяет, пошёл ли звук, — гудком, который сотрудник услышит.
        void beep().then((played) => {
          setState(played ? "on" : "blocked");
        });
      }}
    >
      {state === "on"
        ? sound.enabled
        : state === "blocked"
          ? sound.blocked
          : sound.enable}
    </button>
  );
}
