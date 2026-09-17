// Одинаковые доступы и один список команд у всех целей прогона (T226, решение D101).
//
// Откуда взялась задача. Цель прогона, отличающаяся набором переменных или флагов, —
// вторая правда о состоянии проекта: зелёной она будет ровно тогда, когда проверяет
// меньше. В этом проекте расхождение уже было: `scripts/check` звал
// `vitest run --coverage --reporter=junit`, а `npm test` — голый `vitest run`, то есть
// прогон «у себя» не писал ни покрытия, ни машинного отчёта и не проходил ни одного из
// двух гейтов, которые по ним считаются.
//
// Ниже стережётся то, что расходится на практике: прямой вызов раннера мимо npm-скрипта,
// переменная, приписанная перед командой одной цели, CI со своим списком шагов вместо
// единой команды и цель прогона без планки числа проверок.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { repositoryRoot } from "./repo-copy";
import {
  ciJob,
  codeLines,
  directRunnerCalls,
  inlineEnvNames,
} from "./run-targets";

const REPO_ROOT = repositoryRoot();
const read = (...parts: string[]): string =>
  readFileSync(join(REPO_ROOT, ...parts), "utf8");

const CHECK = read("scripts", "check");
const HOOK = read(".githooks", "pre-push");
const CI = read(".github", "workflows", "check.yml");
const PACKAGE = JSON.parse(read("package.json")) as {
  scripts: Record<string, string>;
};

describe("разбор точек входа", () => {
  test("строки-комментарии в разбор не попадают", () => {
    expect(codeLines("# npm run test\nnpm run e2e\n\n")).toEqual([
      "npm run e2e",
    ]);
  });

  test("прямой вызов раннера виден", () => {
    expect(directRunnerCalls("npx --no-install vitest run --coverage")).toEqual(
      ["npx --no-install vitest run --coverage"],
    );
  });

  test("вызов через npm-скрипт прямым не считается", () => {
    expect(directRunnerCalls("npm run test\nnpm run e2e")).toEqual([]);
  });

  // Браузер в CI ставится сам, и запрет на это сделал бы правило неисполнимым.
  test("установка браузера прямым вызовом раннера не считается", () => {
    expect(
      directRunnerCalls(
        "npx --no-install playwright install --with-deps chromium",
      ),
    ).toEqual([]);
  });

  test("переменная перед командой видна поимённо", () => {
    expect(inlineEnvNames("CI=1 SKIP_DB=1 npm run test")).toEqual([
      "CI",
      "SKIP_DB",
    ]);
  });

  test("команда без приписанных переменных их не даёт", () => {
    expect(inlineEnvNames("npm run test")).toEqual([]);
  });

  test("работа из файла CI вырезается по отступу", () => {
    const workflow =
      "jobs:\n  check:\n    steps:\n      - run: a\n  smoke:\n    steps:\n      - run: b\n";

    expect(ciJob(workflow, "check")).toContain("- run: a");
    expect(ciJob(workflow, "check")).not.toContain("- run: b");
  });
});

describe("цели прогона — один список", () => {
  test("`scripts/check` зовёт тесты теми же командами, что человек", () => {
    expect(CHECK).toContain("npm run test");
    expect(CHECK).toContain("npm run e2e");
  });

  // Ровно то расхождение, из-за которого задача и появилась: свой список флагов в
  // `scripts/check` живёт отдельно от `npm test` и расходится с ним молча.
  test("`scripts/check` не зовёт раннеры напрямую", () => {
    expect(directRunnerCalls(CHECK)).toEqual([]);
  });

  test("флаги прогона заданы один раз — в package.json", () => {
    expect(PACKAGE.scripts["test"]).toContain("--coverage");
    // Один только машинный отчёт — это красный прогон, который НЕ печатает, что упало:
    // при `--reporter=junit` в одиночку консоль показывает лишь «отчёт записан».
    expect(PACKAGE.scripts["test"]).toContain("--reporter=default");
    expect(PACKAGE.scripts["test"]).toContain(
      "--outputFile=reports/vitest.junit.xml",
    );
    expect(PACKAGE.scripts["e2e"]).toBe("playwright test");
  });

  test("хук pre-push зовёт ту же единую команду и ничего своего", () => {
    expect(HOOK).toContain("scripts/check");
    expect(directRunnerCalls(HOOK)).toEqual([]);
  });

  test("CI зовёт ту же единую команду, а не свой список шагов", () => {
    const job = ciJob(CI, "check");

    expect(job).toContain("./scripts/check");
    expect(directRunnerCalls(job)).toEqual([]);
  });
});

describe("цели прогона — один набор переменных", () => {
  // Набор один потому, что ни одна цель не заводит своего: все читают окружение копии
  // и `.env` одинаково. Стережём именно это — приписку перед командой.
  test("ни одна точка входа не приписывает переменных своей команде", () => {
    expect(inlineEnvNames(CHECK)).toEqual([]);
    expect(inlineEnvNames(HOOK)).toEqual([]);
    expect(inlineEnvNames(ciJob(CI, "check"))).toEqual([]);
  });
});

describe("планка числа проверок", () => {
  test("у каждой цели прогона есть планка", () => {
    const baseline = JSON.parse(read("test-count-baseline.json")) as Record<
      string,
      { executed: number }
    >;

    for (const target of ["vitest", "playwright"]) {
      expect(typeof baseline[target]?.executed).toBe("number");
    }
  });

  test("планка стоит в едином прогоне и после обоих раннеров", () => {
    const lines = codeLines(CHECK);
    const gate = lines.findIndex((line) =>
      line.includes("scripts/test-count-gate.mjs"),
    );
    const e2e = lines.findIndex((line) => line.includes("npm run e2e"));

    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(e2e);
  });

  // Отчёт прошлого прогона, доживший до следующего, делает планку зелёной по проверкам,
  // которых сегодня не выполнялось, — это тот же молчаливый отказ гейта.
  test("прогон начинается со сноса отчётов прошлого раза", () => {
    expect(CHECK).toContain("rm -f reports/vitest.junit.xml");
  });
});
