// Публичный вход в блок demo. Сид зовут `scripts/seed-demo.mjs` и сквозные проверки;
// прикладные экраны блока у демо нет — контур целиком живёт в данных.
export type { DemoSeedSummary, DemoStationCode, SeedOptions } from "./seed";
export { seedDemo } from "./seed";

// Отказ сида, сказанный словами: печатает `scripts/seed-demo.mjs`.
export { DemoSeedError, describeSeedFailure } from "./failure";

export type { DemoDataset } from "./model";
export { DEMO } from "./dataset";

// Уборка за сквозным смоуком и перепись контура: зовёт `scripts/mvp-smoke.mjs`.
export type { Census, SmokeNames, SmokeSweep } from "./smoke";
export {
  SMOKE_MARKER,
  censusDifferences,
  contourCensus,
  countDetachedChecklists,
  readCensus,
  smokeNames,
  sweepSmokeRuns,
} from "./smoke";
