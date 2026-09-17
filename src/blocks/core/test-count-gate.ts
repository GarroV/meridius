/**
 * Планка числа ВЫПОЛНЕННЫХ проверок (T225, решение D101).
 *
 * У прогона два разных состояния, которые код возврата не различает: «двести проверок
 * прошли» и «ни одна не выполнялась». Замер на соседнем проекте `decimus`: гейт трижды
 * был зелёным, пока 339 проверок молча пропускались из-за незаданной переменной
 * с доступами. Ни одна проверка при этом не падала — падать было нечему.
 *
 * Поэтому число выполненных проверок лежит в репозитории (`test-count-baseline.json`,
 * рядом с конфигурацией раннеров) и читается из машинного отчёта — оттуда же, откуда
 * его читает приёмка, а не из текста вывода. Прогон, выполнивший меньше, красный, даже
 * если ни один тест не упал.
 *
 * Пропуск при этом считается падением. Законен ровно тот пропуск, который объявлен
 * поимённо в базе: признак платформы или помеченный ожидаемым. Пропуск «нет окружения»
 * никто не объявляет — он и есть тот самый молчаливый отказ.
 *
 * Принцип тот же, что у относительного порога покрытия (`coverage-gate.ts`): база живёт
 * в репозитории и двигается только вверх, командой после принятой приёмки.
 */

/** Разобранный машинный отчёт прогона (JUnit XML). */
export interface JunitRun {
  /** Всего записей о проверках в отчёте. */
  readonly total: number;
  /** Из них выполненных: пропущенная проверка не выполнялась. */
  readonly executed: number;
  /** Пропущенные — поимённо, в виде `<файл> › <имя>`. */
  readonly skipped: readonly string[];
  /** Записи с падением или ошибкой. */
  readonly failed: number;
  /** Число, объявленное самим отчётом (`tests=…`), если оно там есть. */
  readonly declared: number | undefined;
}

/** Планка одной цели прогона. */
export interface TargetBaseline {
  /** Сколько проверок цель выполняла на прошлой принятой приёмке. */
  readonly executed: number;
  /** Пропуски, объявленные законными: полное имя проверки. */
  readonly allowedSkips?: readonly string[];
}

export interface TestCountVerdict {
  readonly ok: boolean;
  readonly executed: number;
  readonly required: number;
  /** Сколько выполненных проверок недостаёт — с учётом объявленных пропусков. */
  readonly shortfall: number;
  /** Сколько выполнено сверх планки: по этому числу двигают базу. */
  readonly gain: number;
  /** Пропуски, которых никто не объявлял: каждый считается падением. */
  readonly undeclaredSkips: readonly string[];
  /** Падения из отчёта: приёмка читает состав прогона, а не код возврата. */
  readonly failed: number;
  /** Отчёт объявил одно число проверок, разбор насчитал другое. */
  readonly miscount:
    { readonly declared: number; readonly counted: number } | undefined;
}

const ENTITIES = new Map([
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&apos;", "'"],
  ["&#10;", "\n"],
  ["&#13;", "\r"],
  ["&#9;", "\t"],
]);

/** Обратный разбор сущностей XML. `&amp;` последним — иначе он развернёт чужие. */
function unescapeXml(value: string): string {
  let result = value;
  for (const [entity, character] of ENTITIES) {
    result = result.split(entity).join(character);
  }
  return result.split("&amp;").join("&");
}

function attribute(tag: string, name: string): string | undefined {
  const found = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return found?.[1] === undefined ? undefined : unescapeXml(found[1]);
}

/**
 * Разбирает JUnit XML обоих раннеров проекта: vitest и playwright пишут его одинаково.
 *
 * Разбор свой, а не библиотечный, сознательно: гейт обязан работать в свежем клоне до
 * установки чего бы то ни было, а разбираемое — машинный вывод известной формы, а не
 * произвольный XML. Сверка с объявленным числом (`tests=…`) стоит здесь ровно затем,
 * чтобы ошибка этого разбора не прошла молча.
 */
export function readJunit(xml: string): JunitRun {
  const suites = /<testsuites\b([^>]*)>/.exec(xml);
  const declaredRaw =
    suites?.[1] === undefined ? undefined : attribute(suites[1], "tests");
  const declared =
    declaredRaw === undefined || !/^\d+$/.test(declaredRaw)
      ? undefined
      : Number(declaredRaw);

  const cases = /<testcase\b([^>]*?)(\/?)>/g;
  const skipped: string[] = [];
  let total = 0;
  let executed = 0;
  let failed = 0;

  for (const match of xml.matchAll(cases)) {
    total += 1;
    const [tag] = match;
    const attributes = match[1] ?? "";
    const selfClosing = match[2] === "/";
    const start = match.index + tag.length;
    const end = selfClosing ? start : xml.indexOf("</testcase>", start);
    const body = end === -1 ? "" : xml.slice(start, end);

    if (/<skipped\b/.test(body)) {
      const file = attribute(attributes, "classname") ?? "?";
      const name = attribute(attributes, "name") ?? "?";
      skipped.push(`${file} › ${name}`);
      continue;
    }

    executed += 1;
    if (/<failure\b|<error\b/.test(body)) failed += 1;
  }

  return { total, executed, skipped, failed, declared };
}

/**
 * Сравнивает прогон с планкой цели.
 *
 * Объявленный пропуск объясняет ровно себя: три объявленных пропуска опускают планку
 * на три проверки и ни на одну больше. Иначе один объявленный пропуск покрывал бы
 * исчезновение всего набора — ровно та дыра, которую планка и закрывает.
 */
export function checkTestCount(
  baseline: TargetBaseline,
  run: JunitRun,
): TestCountVerdict {
  const allowed = new Set(baseline.allowedSkips ?? []);
  const undeclaredSkips = run.skipped.filter((name) => !allowed.has(name));
  const excused = run.skipped.length - undeclaredSkips.length;

  const required = baseline.executed - excused;
  const shortfall = Math.max(0, required - run.executed);
  const gain = Math.max(0, run.executed - baseline.executed);

  const miscount =
    run.declared !== undefined && run.declared !== run.total
      ? { declared: run.declared, counted: run.total }
      : undefined;

  return {
    ok:
      shortfall === 0 &&
      undeclaredSkips.length === 0 &&
      run.failed === 0 &&
      miscount === undefined,
    executed: run.executed,
    required,
    shortfall,
    gain,
    undeclaredSkips,
    failed: run.failed,
    miscount,
  };
}
