#!/usr/bin/env node
// Порог покрытия, который держит машина, а не внимательность человека (T180).
//
// Порог ОТНОСИТЕЛЬНЫЙ: сравнивается не с числом из принципов, а с прошлой принятой
// приёмкой. База лежит в `coverage-baseline.json` рядом с кодом и двигается только
// вверх — `node scripts/coverage-gate.mjs --update` после того, как приёмка принята.
//
//   node scripts/coverage-gate.mjs            проверить прогон против базы
//   node scripts/coverage-gate.mjs --update   принять выросшие числа как новую базу
//
// Зовётся из `scripts/check` последним шагом после тестов: раньше их отчёта ещё нет.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

register("./src-resolve-hook.mjs", import.meta.url);

const { compareCoverage, MEASURES } =
  await import("../src/blocks/core/coverage-gate.ts");

const REPORT = fileURLToPath(
  new URL("../reports/coverage/coverage-summary.json", import.meta.url),
);
const BASELINE = fileURLToPath(
  new URL("../coverage-baseline.json", import.meta.url),
);

const update = process.argv.includes("--update");

// Отчёта нет — это провал, а не «покрытие не менялось»: прогон без отчёта и прогон
// без единой выполненной проверки выглядят одинаково, и различить их можно только так.
if (!existsSync(REPORT)) {
  console.error(
    "НЕТ ОТЧЁТА О ПОКРЫТИИ: reports/coverage/coverage-summary.json.\n" +
      "  Покрытие не считалось — это провал проверки, а не её пропуск.\n" +
      "  Отчёт пишет `vitest run --coverage`; в `scripts/check` он идёт раньше этого шага.",
  );
  process.exit(1);
}

const total = JSON.parse(readFileSync(REPORT, "utf8")).total ?? {};
const current = Object.fromEntries(
  MEASURES.filter((measure) => typeof total[measure]?.pct === "number").map(
    (measure) => [measure, total[measure].pct],
  ),
);

const percent = (value) => `${value.toFixed(2)}%`;

if (!existsSync(BASELINE)) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.log(
    "Базы покрытия не было — записана по этому прогону:\n" +
      MEASURES.map((m) => `  ${m}: ${percent(current[m] ?? 0)}`).join("\n") +
      "\nСледующие прогоны сравниваются с ней.",
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const verdict = compareCoverage(baseline, current);

for (const measure of verdict.missing) {
  console.error(`НЕТ МЕРЫ В ОТЧЁТЕ: ${measure} — считать её было нечем.`);
}
for (const drop of verdict.drops) {
  console.error(
    `ПОКРЫТИЕ ПРОСЕЛО: ${drop.measure} ${percent(drop.was)} → ${percent(drop.now)}`,
  );
}

if (!verdict.ok) {
  console.error(
    "\nПорог относительный: ниже прошлой принятой приёмки — значит блок не принят.\n" +
      "  Допишите проверки на то, что добавили, а не понижайте базу.\n" +
      "  База двигается вверх командой `node scripts/coverage-gate.mjs --update`.",
  );
  process.exit(1);
}

for (const gain of verdict.gains) {
  console.log(
    `покрытие выросло: ${gain.measure} ${percent(gain.was)} → ${percent(gain.now)}`,
  );
}

if (update && verdict.gains.length > 0) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.log("База покрытия обновлена по этому прогону.");
} else if (verdict.gains.length > 0) {
  console.log(
    "База не тронута: обновить её — `node scripts/coverage-gate.mjs --update` после приёмки.",
  );
}

console.log("покрытие не ниже базы по всем четырём мерам");
