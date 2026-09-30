// План импорта справочника сети внутри одной страны (#141): чистая функция без базы.
//
// Опознание идёт по коду точки, а имя — только запасной путь. До кода импорт узнавал
// пиццерию по названию, и переименование на экране превращало следующий прогон в дубль,
// который нечем было отличить. Теперь порядок такой:
//   1. запись файла с кодом находит строку с тем же кодом;
//   2. не нашла — берёт строку с тем же названием и БЕЗ кода (пиццерия, заведённая до
//      кода, получает его, а не дубль рядом);
//   3. запись без кода (старый формат файла — просто строка названия) ищет по названию.
// Строку, у которой уже другой код, по названию не присваиваем: это другая точка.
//
// Поле, которого в записи нет, план не трогает: файл старого формата не знает ни города,
// ни кода, и стирать их по его молчанию значило бы отвязать пиццерию от справочника.
// Лишнего план не удаляет никогда (принцип 3) — такие строки уходят в `unknown`.

const CODE_MAX = 64;
const CITY_MAX = 120;

/** Отказ разбора или плана: файл описан так, что писать по нему в базу нельзя. */
export class NetworkPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkPlanError";
  }
}

/** Пиццерия из файла. `undefined` у города и кода — в файле этого поля нет. */
export interface NetworkStore {
  name: string;
  city: string | undefined;
  code: string | undefined;
}

export interface ExistingStore {
  id: string;
  name: string;
  city: string | null;
  code: string | null;
  timezone: string;
}

export interface StoreCreate {
  name: string;
  city?: string;
  code?: string;
  timezone: string;
}

export interface StoreUpdate {
  id: string;
  /** Название до правки — чтобы отчёт показал переименование человеку. */
  previousName: string;
  set: { name?: string; city?: string; code?: string; timezone?: string };
}

export interface StoreImportPlan {
  creates: StoreCreate[];
  updates: StoreUpdate[];
  unchanged: number;
  /** Названия пиццерий страны, которых нет в файле: не тронуты, решение за человеком. */
  unknown: string[];
}

function optionalField(
  raw: Record<string, unknown>,
  key: "city" | "code",
  max: number,
): string | undefined {
  const value = raw[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new NetworkPlanError(
      `Поле ${key} должно быть строкой: ${JSON.stringify(raw)}`,
    );
  }
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > max) {
    throw new NetworkPlanError(
      `Поле ${key} пустое или длиннее ${String(max)} знаков: ${JSON.stringify(raw)}`,
    );
  }
  return trimmed;
}

/** Разбирает запись пиццерии из файла: строка названия или `{ name, city?, code? }`. */
export function readNetworkStore(raw: unknown): NetworkStore {
  if (typeof raw === "string") raw = { name: raw };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new NetworkPlanError(
      `Пиццерия описана не строкой и не объектом: ${JSON.stringify(raw)}`,
    );
  }
  const record = raw as Record<string, unknown>;
  const rawName = record["name"];
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (name === "") {
    throw new NetworkPlanError(
      `У пиццерии нет названия: ${JSON.stringify(raw)}`,
    );
  }
  return {
    name,
    city: optionalField(record, "city", CITY_MAX),
    code: optionalField(record, "code", CODE_MAX),
  };
}

function assertNoRepeats(entries: readonly NetworkStore[]): void {
  const codes = new Set<string>();
  const bareNames = new Set<string>();
  for (const entry of entries) {
    if (entry.code !== undefined) {
      if (codes.has(entry.code)) {
        throw new NetworkPlanError(
          `Код точки «${entry.code}» в файле повторяется`,
        );
      }
      codes.add(entry.code);
    } else {
      if (bareNames.has(entry.name)) {
        throw new NetworkPlanError(
          `Пиццерия «${entry.name}» без кода в файле повторяется: различить их нечем`,
        );
      }
      bareNames.add(entry.name);
    }
  }
}

function changesFor(
  row: ExistingStore,
  entry: NetworkStore,
  timezone: string,
): StoreUpdate["set"] {
  return {
    ...(row.name === entry.name ? {} : { name: entry.name }),
    ...(entry.city === undefined || row.city === entry.city
      ? {}
      : { city: entry.city }),
    ...(entry.code === undefined || row.code === entry.code
      ? {}
      : { code: entry.code }),
    ...(row.timezone === timezone ? {} : { timezone }),
  };
}

function createFor(entry: NetworkStore, timezone: string): StoreCreate {
  return {
    name: entry.name,
    ...(entry.city === undefined ? {} : { city: entry.city }),
    ...(entry.code === undefined ? {} : { code: entry.code }),
    timezone,
  };
}

/** Сопоставляет записи файла со строками страны: код, затем имя строки без кода, затем имя. */
function matchRows(
  existing: readonly ExistingStore[],
  entries: readonly NetworkStore[],
): Map<NetworkStore, ExistingStore> {
  const taken = new Set<string>();
  const matches = new Map<NetworkStore, ExistingStore>();
  const claim = (
    entry: NetworkStore,
    accept: (row: ExistingStore) => boolean,
  ): void => {
    if (matches.has(entry)) return;
    const row = existing.find((item) => !taken.has(item.id) && accept(item));
    if (row === undefined) return;
    taken.add(row.id);
    matches.set(entry, row);
  };

  const coded = entries.filter((entry) => entry.code !== undefined);
  for (const entry of coded) claim(entry, (row) => row.code === entry.code);
  for (const entry of coded) {
    claim(entry, (row) => row.code === null && row.name === entry.name);
  }
  for (const entry of entries.filter((item) => item.code === undefined)) {
    claim(entry, (row) => row.name === entry.name);
  }
  return matches;
}

export function planStoreImport(
  existing: readonly ExistingStore[],
  entries: readonly NetworkStore[],
  timezone: string,
): StoreImportPlan {
  assertNoRepeats(entries);
  const matches = matchRows(existing, entries);

  const creates: StoreCreate[] = [];
  const updates: StoreUpdate[] = [];
  let unchanged = 0;
  for (const entry of entries) {
    const row = matches.get(entry);
    if (row === undefined) {
      creates.push(createFor(entry, timezone));
      continue;
    }
    const set = changesFor(row, entry, timezone);
    if (Object.keys(set).length === 0) unchanged += 1;
    else updates.push({ id: row.id, previousName: row.name, set });
  }

  const matchedIds = new Set([...matches.values()].map((row) => row.id));
  const unknown = existing
    .filter((row) => !matchedIds.has(row.id))
    .map((row) => row.name);
  return { creates, updates, unchanged, unknown };
}
