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
const present = MEASURES.filter(
  (measure) => typeof total[measure]?.pct === "number",
);
const current = Object.fromEntries(
  present.map((measure) => [measure, total[measure].pct]),
);
// Число непокрытых — то, чем меряют с T244: оно не растёт от удаления кода,
// а усыхание проверок ловит по-прежнему. Доля остаётся для человека в выводе.
current.uncovered = Object.fromEntries(
  present
    .filter(
      (measure) =>
        typeof total[measure].total === "number" &&
        typeof total[measure].covered === "number",
    )
    .map((measure) => [measure, total[measure].total - total[measure].covered]),
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
  const how =
    drop.by === "uncovered"
      ? `непокрытых стало больше: ${baseline.uncovered?.[drop.measure]} → ${current.uncovered?.[drop.measure]}`
      : `доля просела: ${percent(drop.was)} → ${percent(drop.now)}`;
  console.error(`ПОКРЫТИЕ ПРОСЕЛО: ${drop.measure} — ${how}`);
}

// База старого формата (до T244) знает только доли, поэтому уборку она по-прежнему
// читает как просадку. Перевести её на числа непокрытых можно только руками и только
// вместе с --update: молча снимать порог нельзя, а вечно краснеть на удалении кода
// он не должен.
if (!verdict.ok && update && baseline.uncovered === undefined) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.log(
    "База переведена на числа непокрытых по ЭТОМУ прогону (T244).\n" +
      "  Прежняя база знала только доли, и просадку доли от удаления покрытого кода\n" +
      "  она отличить не могла. С этого прогона сравнивается число непокрытых:\n" +
      MEASURES.filter((m) => current.uncovered?.[m] !== undefined)
        .map(
          (m) =>
            `  ${m}: непокрытых ${current.uncovered[m]}, доля ${percent(current[m])}`,
        )
        .join("\n"),
  );
  process.exit(0);
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

if (update && (verdict.gains.length > 0 || baseline.uncovered === undefined)) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.log("База покрытия обновлена по этому прогону.");
} else if (verdict.gains.length > 0) {
  console.log(
    "База не тронута: обновить её — `node scripts/coverage-gate.mjs --update` после приёмки.",
  );
}

console.log("покрытие не ниже базы по всем четырём мерам");
