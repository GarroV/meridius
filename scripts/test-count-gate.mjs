#!/usr/bin/env node
// Планка числа выполненных проверок (T225, решение D101).
//
// Код возврата не отличает «двести проверок прошли» от «ни одна не выполнялась»,
// поэтому состав прогона читается из машинного отчёта — оттуда же, откуда его читает
// приёмка. Планка лежит в `test-count-baseline.json` рядом с конфигурацией раннеров и
// двигается только вверх, как база покрытия.
//
//   node scripts/test-count-gate.mjs            проверить отчёты против планки
//   node scripts/test-count-gate.mjs --update   принять выросшие числа как новую планку
//
// Зовётся из `scripts/check` последним шагом: раньше отчётов обоих раннеров ещё нет.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

register("./src-resolve-hook.mjs", import.meta.url);

const { checkTestCount, readJunit } =
  await import("../src/blocks/core/test-count-gate.ts");

const local = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

/** Цели прогона и их отчёты. Список один на весь проект — второго списка не заводить. */
const TARGETS = [
  {
    name: "vitest",
    title: "модульные и интеграционные",
    report: "reports/vitest.junit.xml",
    command: "npm test",
  },
  {
    name: "playwright",
    title: "сквозные сценарии",
    report: "reports/playwright.junit.xml",
    command: "npm run e2e",
  },
];

const BASELINE = local("test-count-baseline.json");
const update = process.argv.includes("--update");

const runs = new Map();
let failed = false;

// Отчёта нет — это провал, а не «проверок не было». Прогон без отчёта и прогон без
// единой выполненной проверки выглядят одинаково, различить их можно только так.
for (const target of TARGETS) {
  const path = local(target.report);
  if (!existsSync(path)) {
    console.error(
      `НЕТ ОТЧЁТА О ПРОГОНЕ: ${target.report} (${target.title}).\n` +
        `  Проверки не выполнялись — это провал, а не их пропуск.\n` +
        `  Отчёт пишет \`${target.command}\`; в \`scripts/check\` он идёт раньше этого шага.`,
    );
    failed = true;
    continue;
  }
  runs.set(target.name, readJunit(readFileSync(path, "utf8")));
}

if (failed) process.exit(1);

const current = Object.fromEntries(
  TARGETS.map((target) => [
    target.name,
    { executed: runs.get(target.name).executed, allowedSkips: [] },
  ]),
);

if (!existsSync(BASELINE)) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.log(
    "Планки числа проверок не было — записана по этому прогону:\n" +
      TARGETS.map(
        (t) => `  ${t.name}: ${String(current[t.name].executed)} выполнено`,
      ).join("\n") +
      "\nСледующие прогоны сравниваются с ней.",
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const grown = {};

for (const target of TARGETS) {
  const run = runs.get(target.name);
  const planned = baseline[target.name];

  if (planned === undefined || typeof planned.executed !== "number") {
    console.error(
      `НЕТ ПЛАНКИ ДЛЯ ЦЕЛИ: ${target.name} в test-count-baseline.json.\n` +
        `  Цель прогона без планки проверяется ничем — это провал, а не пропуск.`,
    );
    failed = true;
    continue;
  }

  const verdict = checkTestCount(planned, run);
  const head = `${target.name} (${target.title}): выполнено ${String(verdict.executed)}, планка ${String(verdict.required)}`;

  if (verdict.miscount !== undefined) {
    console.error(
      `ОТЧЁТ РАЗОБРАН НЕВЕРНО: ${target.report} объявляет ${String(verdict.miscount.declared)} проверок, разобрано ${String(verdict.miscount.counted)}.\n` +
        `  Число выполненных проверок недостоверно — гейт этого не пропускает.`,
    );
  }
  if (verdict.shortfall > 0) {
    console.error(
      `ВЫПОЛНЕНО МЕНЬШЕ ПЛАНКИ: ${head} (недостаёт ${String(verdict.shortfall)}).\n` +
        `  Ни одна проверка могла не упасть — падать нечему, когда проверки не выполнялись.\n` +
        `  Планка опускается только сознательно: правкой test-count-baseline.json с причиной.`,
    );
  }
  for (const name of verdict.undeclaredSkips) {
    console.error(
      `ПРОПУСК СЧИТАЕТСЯ ПАДЕНИЕМ: ${name}\n` +
        `  Законен только объявленный пропуск — признак платформы или помеченный ожидаемым.\n` +
        `  Объявить: строкой "${name}" в allowedSkips цели ${target.name} (test-count-baseline.json).`,
    );
  }
  if (verdict.failed > 0) {
    console.error(
      `ПАДЕНИЯ В ОТЧЁТЕ: ${target.name} — ${String(verdict.failed)}. Код возврата их не различает, отчёт различает.`,
    );
  }

  if (!verdict.ok) {
    failed = true;
    continue;
  }

  if (verdict.gain > 0) {
    grown[target.name] = { ...planned, executed: run.executed };
    console.log(`${head} — выросла на ${String(verdict.gain)}`);
  } else {
    console.log(head);
  }
}

if (failed) process.exit(1);

const gains = Object.keys(grown);
if (update && gains.length > 0) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ ...baseline, ...grown }, null, 2)}\n`,
  );
  console.log("Планка числа проверок обновлена по этому прогону.");
} else if (gains.length > 0) {
  console.log(
    "Планка не тронута: поднять её — `node scripts/test-count-gate.mjs --update` после приёмки.",
  );
}

console.log("число выполненных проверок не ниже планки, пропусков нет");
