import { describe, expect, test } from "vitest";

import { checkTestCount, readJunit } from "./test-count-gate";

/** Отчёт из одного набора: `cases` подставляется как есть. */
const report = (cases: string, attributes = ""): string =>
  `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="tests"${attributes}>
  <testsuite name="a.test.ts">
${cases}
  </testsuite>
</testsuites>`;

const passed = (name: string, file = "a.test.ts"): string =>
  `    <testcase classname="${file}" name="${name}" time="0.1">
    </testcase>`;

const skipped = (name: string, file = "a.test.ts"): string =>
  `    <testcase classname="${file}" name="${name}" time="0">
      <skipped/>
    </testcase>`;

describe("readJunit", () => {
  test("считает выполненные проверки по отчёту, а не по коду возврата", () => {
    const run = readJunit(
      report([passed("первая"), passed("вторая")].join("\n")),
    );

    expect(run.total).toBe(2);
    expect(run.executed).toBe(2);
    expect(run.skipped).toEqual([]);
    expect(run.failed).toBe(0);
  });

  // Ради этого разбор и нужен: пропущенная проверка не выполнялась, и складывать её
  // с выполненными — значит выдавать невыполненное за пройденное.
  test("пропущенная проверка не считается выполненной и называется поимённо", () => {
    const run = readJunit(
      report([passed("первая"), skipped("вторая")].join("\n")),
    );

    expect(run.total).toBe(2);
    expect(run.executed).toBe(1);
    expect(run.skipped).toEqual(["a.test.ts › вторая"]);
  });

  test("падения и ошибки видны из отчёта отдельно", () => {
    const run = readJunit(
      report(
        `    <testcase classname="a.test.ts" name="упала">
      <failure message="не сошлось">подробности</failure>
    </testcase>
    <testcase classname="a.test.ts" name="сломалась">
      <error message="взорвалась">подробности</error>
    </testcase>`,
      ),
    );

    expect(run.executed).toBe(2);
    expect(run.failed).toBe(2);
  });

  test("самозакрытая запись проверки разбирается наравне с парной", () => {
    const run = readJunit(
      report(`    <testcase classname="a.test.ts" name="одна" time="0.1"/>`),
    );

    expect(run.total).toBe(1);
    expect(run.executed).toBe(1);
  });

  // Имена проверок этого проекта содержат «&gt;» от вложенных describe и кавычки:
  // без разбора сущностей объявить пропуск законным нельзя — строки не совпадут.
  test("сущности в имени разворачиваются обратно", () => {
    const run = readJunit(
      report(skipped("охрана &gt; без куки уводит на &quot;вход&quot;")),
    );

    expect(run.skipped).toEqual([
      'a.test.ts › охрана > без куки уводит на "вход"',
    ]);
  });

  test("объявленное отчётом число проверок читается для сверки с разбором", () => {
    const run = readJunit(report(passed("одна"), ' tests="1"'));

    expect(run.declared).toBe(1);
  });

  test("отчёт без объявленного числа разбирается без него", () => {
    const run = readJunit(report(passed("одна")));

    expect(run.declared).toBeUndefined();
  });

  test("пустой отчёт — ноль выполненных, а не отсутствие мнения", () => {
    const run = readJunit(report(""));

    expect(run.total).toBe(0);
    expect(run.executed).toBe(0);
  });
});

/** Прогон-образец: десять выполненных проверок, ничего не пропущено и не упало. */
const run = (over: Partial<ReturnType<typeof readJunit>> = {}) => ({
  total: 10,
  executed: 10,
  skipped: [] as readonly string[],
  failed: 0,
  declared: 10,
  ...over,
});

describe("checkTestCount", () => {
  test("прогон вровень с планкой проходит", () => {
    const verdict = checkTestCount({ executed: 10 }, run());

    expect(verdict.ok).toBe(true);
    expect(verdict.shortfall).toBe(0);
  });

  // Тот самый случай, ради которого заведена планка: ни одна проверка не упала,
  // но выполнилось их меньше — и без планки это зелёный прогон.
  test("выполнено меньше планки — красный, даже если ничего не упало", () => {
    const verdict = checkTestCount(
      { executed: 10 },
      run({ executed: 7, total: 7 }),
    );

    expect(verdict.ok).toBe(false);
    expect(verdict.shortfall).toBe(3);
    expect(verdict.failed).toBe(0);
  });

  test("необъявленный пропуск считается падением, а не пропуском", () => {
    const verdict = checkTestCount(
      { executed: 9 },
      run({ executed: 9, skipped: ["a.test.ts › вторая"] }),
    );

    expect(verdict.ok).toBe(false);
    expect(verdict.undeclaredSkips).toEqual(["a.test.ts › вторая"]);
  });

  // Законен ровно объявленный пропуск: признак платформы или помеченный ожидаемым.
  // Объявляется он поимённо и руками — чтобы пропуск нельзя было завести молча.
  test("объявленный пропуск законен и объясняет ровно себя", () => {
    const verdict = checkTestCount(
      { executed: 10, allowedSkips: ["a.test.ts › только под линуксом"] },
      run({ executed: 9, skipped: ["a.test.ts › только под линуксом"] }),
    );

    expect(verdict.ok).toBe(true);
    expect(verdict.undeclaredSkips).toEqual([]);
    expect(verdict.shortfall).toBe(0);
  });

  test("объявленный пропуск не покрывает недостачу сверх себя", () => {
    const verdict = checkTestCount(
      { executed: 10, allowedSkips: ["a.test.ts › только под линуксом"] },
      run({ executed: 7, skipped: ["a.test.ts › только под линуксом"] }),
    );

    expect(verdict.ok).toBe(false);
    expect(verdict.shortfall).toBe(2);
  });

  test("падение в отчёте краснеет здесь же: код возврата его не различает", () => {
    const verdict = checkTestCount({ executed: 10 }, run({ failed: 1 }));

    expect(verdict.ok).toBe(false);
    expect(verdict.failed).toBe(1);
  });

  // Расхождение объявленного и разобранного значит, что отчёт разобран неверно —
  // и тогда число выполненных проверок недостоверно, чем бы оно ни было.
  test("расхождение объявленного числа с разобранным — провал", () => {
    const verdict = checkTestCount({ executed: 10 }, run({ declared: 12 }));

    expect(verdict.ok).toBe(false);
    expect(verdict.miscount).toEqual({ declared: 12, counted: 10 });
  });

  test("рост против планки отмечается отдельно — по нему двигают базу", () => {
    const verdict = checkTestCount(
      { executed: 10 },
      run({ executed: 12, total: 12, declared: 12 }),
    );

    expect(verdict.ok).toBe(true);
    expect(verdict.gain).toBe(2);
  });
});
