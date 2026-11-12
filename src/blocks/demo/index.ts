// Публичный вход в блок demo. Сид зовут `scripts/seed-demo.mjs` и сквозные проверки;
// прикладные экраны блока у демо нет — контур целиком живёт в данных.
export type { DemoSeedSummary, DemoStationCode, SeedOptions } from "./seed";
export { seedDemo, seedShowcase } from "./seed";

// Демо-режим (D193): признак для лендинга и экрана выбора роли.
export { isDemoMode } from "./mode";
export type { DemoRole } from "./roles";
export {
  COUNTRY_DEMOLAND_ID,
  COUNTRY_FREEDONIA_ID,
  COUNTRY_RURITANIA_ID,
  DEMO_ACCOUNTS,
  DEMO_ROLES,
  KITCHEN_STATION_CODE,
  TENANT_FREEDONIA_ID,
  findDemoRole,
} from "./roles";

// Отказ сида, сказанный словами: печатает `scripts/seed-demo.mjs`.
export { DemoSeedError, describeSeedFailure } from "./failure";

export type { DemoDataset } from "./model";
export { DEMO } from "./dataset";

// Уборка за сквозным смоуком и перепись контура: зовёт `scripts/mvp-smoke.mjs`.
export type { Census, SmokeNames, SmokeSweep } from "./smoke";
export {
  SMOKE_MARKER,
  blocksChanged,
  censusDifferences,
  contourCensus,
  countDetachedChecklists,
  readCensus,
  smokeNames,
  sweepSmokeRuns,
} from "./smoke";
