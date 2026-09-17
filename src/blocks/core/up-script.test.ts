// Режим подготовки без запуска у `scripts/up` (T194).
//
// Откуда взялась задача. `scripts/up` — та самая «одна команда, поднимающая продукт»,
// которой техплан меряет готовность. Заканчивалась она `exec next start`, то есть
// держала сервер в foreground: в неинтерактивном прогоне (CI, приёмка, смоук)
// управление не возвращалось НИКОГДА — проверено дважды 17.09, оба прогона висели до
// отмены. Обходили это тем, что CI повторял шаги подготовки своими руками — и ровно
// поэтому «поднимается одной командой» перестала проверять та самая команда: разошлись
// бы они молча, как уже разошлись три копии решения про порт.
//
// Что стережётся ниже: флаг существует, запуск сервера стоит ПОД УСЛОВИЕМ (а не
// последней безусловной строкой), неизвестный параметр — отказ, а CI зовёт единый
// вызов вместо повторённых шагов.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { repositoryRoot } from "./repo-copy";

const REPO_ROOT = repositoryRoot();
const UP_PATH = join(REPO_ROOT, "scripts", "up");
const CI_PATH = join(REPO_ROOT, ".github", "workflows", "check.yml");

/** Текст скрипта без строк-комментариев: пояснения в `up` упоминают и шаги, и флаги. */
function shellCodeText(content: string): string {
  return content
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

/** Запуск `scripts/up` с параметрами. Возвращает код возврата и весь вывод. */
function runUp(...args: readonly string[]): {
  status: number;
  output: string;
} {
  try {
    const output = execFileSync("bash", [UP_PATH, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      cwd: REPO_ROOT,
      timeout: 20_000,
    });
    return { status: 0, output };
  } catch (error) {
    const failure = error as {
      status?: number | null;
      stdout?: string;
      stderr?: string;
    };
    return {
      status: failure.status ?? -1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

describe("scripts/up: разбор параметров", () => {
  // Разбор обязан стоять ДО всего остального: ошибка в параметре должна отвечать
  // мгновенно, а не после поднятой базы и накатанных миграций. Поэтому случай ниже
  // безопасен — он ничего не поднимает.
  test("неизвестный параметр — отказ с ненулевым кодом, и отказ называет параметр", () => {
    const { status, output } = runUp("--такого-нет");
    expect(status).not.toBe(0);
    expect(output).toContain("--такого-нет");
  });

  test("отказ по параметру не доходит до docker: база не поднимается", () => {
    const { output } = runUp("--такого-нет");
    // «База (…)» — заголовок шага подъёма контейнера. Его появление означало бы,
    // что разбор параметров стоит после запуска стенда.
    expect(output).not.toContain("База (");
  });
});

describe("scripts/up: режим подготовки без запуска", () => {
  test("флаг --no-start скрипту известен", () => {
    const content = readFileSync(UP_PATH, "utf8");
    expect(shellCodeText(content)).toContain("--no-start");
  });

  test("запуск сервера стоит под условием, а не безусловной последней строкой", () => {
    const codeText = shellCodeText(readFileSync(UP_PATH, "utf8"));
    const launch = /exec node scripts\/next-app\.mjs start/.exec(codeText);
    expect(launch, "не найден запуск сервера").not.toBeNull();

    // Сравнивается с ПОСЛЕДНИМ упоминанием режима, а не с первым: первое — это разбор
    // параметров в шапке, и оно стоит раньше чего угодно, то есть сторож на нём был бы
    // зелёным всегда. Последнее упоминание — та самая ветка перед запуском.
    const modeCheck = codeText.lastIndexOf("NO_START");
    expect(modeCheck, "режим нигде не проверяется").toBeGreaterThan(-1);
    expect(launch?.index ?? -1).toBeGreaterThan(modeCheck);
  });

  test("в режиме подготовки скрипт выходит нулём явно", () => {
    const codeText = shellCodeText(readFileSync(UP_PATH, "utf8"));
    // Выход именно явный: «просто не дойти до exec» — это выход кодом последней
    // команды, а она в этом скрипте `printf`, и её код однажды станет чужим.
    expect(codeText).toMatch(/NO_START[\S\s]{0,600}?exit 0/);
  });
});

describe("CI зовёт единый вызов, а не повторяет шаги", () => {
  test("в прогоне есть вызов scripts/up с режимом подготовки", () => {
    const content = readFileSync(CI_PATH, "utf8");
    expect(content).toMatch(/scripts\/up --no-start/);
  });

  // Дубли шагов — тот же класс, что три копии решения про порт: расходятся молча.
  // Поэтому CI не имеет права звать подготовку своими руками, когда есть общая команда.
  test.each([
    ["подъём базы", /docker compose -p \S+ up -d db/],
    ["миграции", /npm run (?:--silent )?db:migrate/],
    ["демонстрационный контур", /node scripts\/seed-demo\.mjs/],
  ])("CI не повторяет шаг «%s» своими руками", (_name, pattern) => {
    const content = readFileSync(CI_PATH, "utf8");
    // Комментарии CI об этих шагах законны — смотрим только на строки, не являющиеся
    // комментарием целиком.
    const codeText = content
      .split("\n")
      .filter((line) => !/^\s*#/.test(line))
      .join("\n");
    expect(codeText).not.toMatch(pattern);
  });
});
