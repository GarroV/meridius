"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import type { OverdueSignalView } from "../model";
import { beep } from "./beep";
import { startRefreshClock } from "./refresh-clock";

/**
 * Сигнал станции о пропущенной проверке (T138, issue #51).
 *
 * Поднимается ПО ЗАКРЫТИЮ прохода без отметки: пока проход идёт, станция молчит, а
 * строка обхода и так говорит, до какого времени успеть. Гаснет с отметкой — она встаёт
 * в текущий проход (D066), и звонящих пунктов не остаётся.
 *
 * Звонит СТАНЦИЯ, а не пункт: три просрочки дают один звонок, по самой частой из
 * настроек (D068). Адресат — место, а не человек: заполняющего продукт не опознаёт
 * (D001), и звать поимённо некого. Эскалации наружу нет (D073) — сигнал звонит здесь,
 * а пропуски собираются в отчётах.
 *
 * Плашку нельзя закрыть кнопкой, и это не недосмотр: закрывается она делом. Кнопка
 * «понятно» превратила бы сигнал в то, что отщёлкивают не глядя, — а пропуск при этом
 * остался бы пропуском.
 *
 * Про часы. Вкладка сама не узнает, что проход закрылся: разметка отрисована сервером
 * и с тех пор не менялась. Поэтому здесь двое часов — одни перерисовывают страницу
 * ответом сервера к ближайшей границе прохода, вторые повторяют звонок. Считать
 * состояние в браузере было бы дешевле и неверно: проход и просрочку считает сервер по
 * местному времени пиццерии (D026), а часы кухонного планшета врут.
 */

const MS = 1000;

const PLATE_CLASS =
  "mx-[var(--space-7)] mt-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-6)] py-[var(--space-5)] text-[var(--err)]";
const HEADLINE_CLASS = "text-[length:var(--fs-lead)] font-semibold";
const TITLES_CLASS = "mt-[var(--space-2)] text-[length:var(--fs-lead)]";
const NOTE_CLASS = "mt-[var(--space-2)] text-[length:var(--fs-meta)]";

const TITLE_SEPARATOR = " · ";

export interface OverduePlateProps {
  readonly overdue: OverdueSignalView | null;
  /** Через сколько секунд состояние панели может измениться само; `null` — уже не изменится. */
  readonly nextChangeInSeconds: number | null;
}

export function OverduePlate({
  overdue,
  nextChangeInSeconds,
}: OverduePlateProps): ReactElement | null {
  const t = useTranslations("fill.rounds.overdue");
  const router = useRouter();
  const [silent, setSilent] = useState(false);
  // Когда звонили в последний раз. Ref, а не состояние: перерисовка не должна
  // считаться поводом позвонить ещё раз — иначе планшет гудел бы на каждое касание.
  const lastRungAt = useRef(0);

  const repeatEverySeconds = overdue?.repeatEverySeconds ?? 0;
  const ringing = overdue !== null;

  useEffect(() => {
    if (!ringing) {
      // Просрочку закрыли. Следующая обязана прозвонить сразу, а не дожидаться
      // остатка прошлого периода: это уже другой пропуск.
      lastRungAt.current = 0;
      return;
    }

    const ring = () => {
      lastRungAt.current = Date.now();
      void beep().then((sounded) => {
        if (!sounded) setSilent(true);
      });
    };

    // Период с прошлого звонка вышел — звоним сейчас. Сюда же попадает свежее открытие
    // экрана при уже стоящей просрочке: планшет перезагрузили посреди смены, и сигнал
    // обязан прозвучать, а не ждать следующего круга.
    if (Date.now() - lastRungAt.current >= repeatEverySeconds * MS) ring();

    if (repeatEverySeconds <= 0) return;
    const timer = globalThis.setInterval(ring, repeatEverySeconds * MS);
    return () => {
      globalThis.clearInterval(timer);
    };
  }, [ringing, repeatEverySeconds]);

  // Свежая величина для часов. Держится в ref, потому что часы спрашивают её сами
  // перед каждым взводом: копия внутри часов стала бы вторым источником правды.
  const nextChange = useRef(nextChangeInSeconds);
  useEffect(() => {
    nextChange.current = nextChangeInSeconds;
  }, [nextChangeInSeconds]);

  // Перевзвод живёт в самих часах (см. `startRefreshClock`), а не в зависимостях
  // эффекта: на ровной сетке очередная величина совпадает с предыдущей, React
  // оставляет прежний эффект — а его таймер уже отработал. Первая просрочка
  // показалась бы, следующие молча нет. Вынесенное поведение закрыто проверкой с
  // поддельными часами (T191): сквозной сценарий десять минут не ждёт, а она не
  // ждёт вовсе.
  useEffect(
    () =>
      startRefreshClock({
        nextChangeInSeconds: () => nextChange.current,
        // Состояние обходов считает сервер: спрашиваем его, а не гадаем во вкладке.
        onDue: () => {
          router.refresh();
        },
      }),
    [nextChangeInSeconds, router],
  );

  if (overdue === null) return null;

  return (
    <div data-testid="rounds-overdue" role="alert" className={PLATE_CLASS}>
      <div className={HEADLINE_CLASS}>
        {t("headline", { count: overdue.missedCount })}
      </div>
      <div className={TITLES_CLASS}>{overdue.titles.join(TITLE_SEPARATOR)}</div>
      {silent ? (
        <div data-testid="rounds-overdue-silent" className={NOTE_CLASS}>
          {t("noSound")}
        </div>
      ) : null}
    </div>
  );
}
