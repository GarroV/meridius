// Сигнал станции о просроченной периодической проверке (T138, D068, D073).
//
// Звонит СТАНЦИЯ, а не пункт: три просрочки — один звонок, по самой частой из настроек.
// Условие «звонящего» пункта держится на трёх частях разом (см. `rings` ниже) — свести
// его к одному `missedCount > 0` нельзя: отметка всегда встаёт в ТЕКУЩИЙ проход (D066)
// и пропущенные не догоняет, поэтому после первого же пропуска `missedCount` не
// обнуляется никогда. Гасит сигнал не число пропусков, а сам факт отметки — она
// переводит строку в `state === "done"`, и звонящих пунктов не остаётся.
import type { RoundsView } from "@/blocks/data";

import type { OverdueSignalView, RoundState } from "./model";

export interface OverdueItem {
  readonly itemId: string;
  readonly title: string;
  /** Как часто повторять сигнал, минуты. `undefined` — этот пункт не оповещает (D068). */
  readonly remindEveryMinutes: number | undefined;
  /** Состояние строки, уже посчитанное панелью. */
  readonly state: RoundState;
  readonly missedCount: number;
}

export interface OverdueInput {
  readonly rounds: RoundsView;
  /** Пункты панели, в её порядке, с названием уже на языке экрана. */
  readonly items: readonly OverdueItem[];
}

export interface OverdueResult {
  readonly overdue: OverdueSignalView | null;
  readonly nextChangeInSeconds: number | null;
  readonly ringsOnMiss: boolean;
}

const SECONDS_PER_MINUTE = 60;

/**
 * Пункт реально звонит сейчас: настройка есть, проход идёт (`state === "due"`, то есть
 * отметки в нём нет), и в нём уже есть пропуск. Когда текущего прохода нет вовсе
 * (`waiting` или `finished`), станция молчит сознательно: отметить сейчас всё равно
 * нельзя — запись отказывает «обхода сейчас не ждут», — и звонок, который нечем
 * погасить, был бы издевательством над сменой.
 */
function rings(
  item: OverdueItem,
): item is OverdueItem & { readonly remindEveryMinutes: number } {
  return (
    item.remindEveryMinutes !== undefined &&
    item.state === "due" &&
    item.missedCount > 0
  );
}

/**
 * Ближайшая граница прохода впереди — по ВСЕМ пунктам сетки, не только звонящим:
 * перерисовка нужна и для остальных строк панели. Границы — начала и концы каждого
 * прохода каждого пункта; считаются только те, что строго больше `offsetMinutes`
 * (граница, на которой сейчас стоим, уже наступила и следующей быть не может).
 *
 * Точность минутная, и это осознанно: `offsetMinutes` приходит целыми минутами, а для
 * сигнала о пропущенном обходе минута роли не играет.
 */
function nextBoundaryMinutes(rounds: RoundsView): number | null {
  const boundaries: number[] = [];
  for (const item of rounds.items) {
    for (const interval of item.intervals) {
      if (interval.startMinutes > rounds.offsetMinutes) {
        boundaries.push(interval.startMinutes);
      }
      if (interval.endMinutes > rounds.offsetMinutes) {
        boundaries.push(interval.endMinutes);
      }
    }
  }
  return boundaries.length === 0 ? null : Math.min(...boundaries);
}

export function buildOverdue(input: OverdueInput): OverdueResult {
  // Считается по ВСЕМ пунктам входа, независимо от состояния: обещание звука на экране
  // не должно зависеть от того, у кого сейчас идёт проход.
  const ringsOnMiss = input.items.some(
    (item) => item.remindEveryMinutes !== undefined,
  );

  const ringing = input.items.filter(rings);
  const overdue: OverdueSignalView | null =
    ringing.length === 0
      ? null
      : {
          missedCount: ringing.reduce(
            (total, item) => total + item.missedCount,
            0,
          ),
          titles: ringing.map((item) => item.title),
          // Три просрочки — один звонок, по САМОЙ ЧАСТОЙ из настроек (D068).
          repeatEverySeconds:
            Math.min(...ringing.map((item) => item.remindEveryMinutes)) *
            SECONDS_PER_MINUTE,
        };

  const nextBoundary = nextBoundaryMinutes(input.rounds);
  const nextChangeInSeconds =
    nextBoundary === null
      ? null
      : (nextBoundary - input.rounds.offsetMinutes) * SECONDS_PER_MINUTE;

  return { overdue, nextChangeInSeconds, ringsOnMiss };
}
