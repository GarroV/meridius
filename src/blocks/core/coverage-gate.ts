/**
 * Относительный порог покрытия (T180).
 *
 * У проекта нет абсолютного порога и не должно быть: он подталкивает дописывать
 * тесты без утверждений ради процента, а приёмку заворачивает по числу, которое
 * ничего не говорит о качестве проверок. Держит качество другое правило —
 * «не ниже, чем на прошлой приёмке». До сих пор это правило исполнял человек
 * глазами: сравнивал четыре дроби в выводе с четырьмя дробями в журнале. Так оно и
 * работало — ровно до первой невнимательности, а просадка бывает в сотых
 * (91,62 → 91,56 на одной непокрытой функции из 984).
 *
 * Здесь та же проверка машинно. База лежит в `coverage-baseline.json` и двигается
 * только вверх — `scripts/coverage-gate.mjs --update` после принятой приёмки.
 */

/** Порядок важен: в этом же порядке меры печатаются и в отчёте, и в журнале. */
export const MEASURES = [
  "lines",
  "statements",
  "functions",
  "branches",
] as const;

type Measure = (typeof MEASURES)[number];

export type Coverage = Readonly<Partial<Record<Measure, number>>> & {
  /**
   * Число НЕПОКРЫТЫХ единиц по мерам. Необязательное: базы, записанные до T244,
   * его не содержат, и с ними сравнение идёт по долям, как раньше.
   *
   * Сравнивать долю оказалось неверно. Доля падает не только когда проверок стало
   * меньше, но и когда покрытого кода стало меньше: удаление покрытой ветви
   * уменьшает знаменатель, и порог краснеет на работе, которая ничего не ухудшила.
   * Живой случай (T220): удалили колонку времени — 2106 покрытых ветвей из 2435
   * стали 2104 из 2433, ни одной новой непокрытой, сквозных сценариев стало больше,
   * а гейт завернул волну. Число непокрытых от удаления кода не растёт, поэтому
   * усыхание проверок оно ловит по-прежнему, а уборку — нет.
   */
  readonly uncovered?: Readonly<Partial<Record<Measure, number>>>;
};

interface Change {
  readonly measure: Measure;
  readonly was: number;
  readonly now: number;
  /** Чем мерили: числом непокрытых (новые базы) или долей (базы до T244). */
  readonly by: "uncovered" | "percent";
}

export interface Verdict {
  readonly ok: boolean;
  /** Меры, просевшие против базы: каждая заворачивает прогон. */
  readonly drops: readonly Change[];
  /** Меры, выросшие против базы: по ним обновляют базу. */
  readonly gains: readonly Change[];
  /** Меры, которых в отчёте не оказалось вовсе: это провал, а не пропуск. */
  readonly missing: readonly Measure[];
}

/**
 * Сравнивает прогон с базой по всем четырём мерам сразу.
 *
 * Отсутствующая мера считается провалом намеренно: отчёт без меры и отчёт с нулём
 * выглядят одинаково безобидно, а означают разное — во втором случае покрытия нет,
 * в первом неизвестно, считалось ли оно вообще.
 */
export function compareCoverage(
  baseline: Coverage,
  current: Coverage,
): Verdict {
  const drops: Change[] = [];
  const gains: Change[] = [];
  const missing: Measure[] = [];

  for (const measure of MEASURES) {
    const was = baseline[measure];
    const now = current[measure];

    if (now === undefined) {
      missing.push(measure);
      continue;
    }
    if (was === undefined) continue;

    const wasUncovered = baseline.uncovered?.[measure];
    const nowUncovered = current.uncovered?.[measure];

    // Обе стороны знают число непокрытых — меряем им: оно не зависит от того,
    // сколько кода удалили. Знает только одна (база старого формата) — остаётся
    // прежнее сравнение долей, иначе переход на новый формат тихо снял бы порог.
    if (wasUncovered !== undefined && nowUncovered !== undefined) {
      if (nowUncovered > wasUncovered) {
        drops.push({ measure, was, now, by: "uncovered" });
      } else if (nowUncovered < wasUncovered) {
        gains.push({ measure, was, now, by: "uncovered" });
      }
      continue;
    }

    if (now < was) drops.push({ measure, was, now, by: "percent" });
    else if (now > was) gains.push({ measure, was, now, by: "percent" });
  }

  return {
    ok: drops.length === 0 && missing.length === 0,
    drops,
    gains,
    missing,
  };
}
