// Счёт главной кабинета (D174) — без базы, чтобы цифры проверялись тестом.
//
// Главная — пульт сети: сколько станций работает, где дырки и чем они закрыты. Её
// цифры читают как факт («8 из 10 станций в работе»), поэтому здесь нет ни одного
// своего правила «что такое дырка»: оно берётся у раздела «Станции» (`gapsOf`), и
// главная не может разойтись с ним молча.
import type { NetworkStation } from "@/blocks/stations/overview";

/** Что со станцией — одним словом для строки таблицы. */
export type StationStatus = "working" | "silent" | "noChecklist";

/** Планшеты станции в том виде, в каком их знает раздел «Устройства». */
export interface StationTabletsFacts {
  readonly stationId: string;
  readonly tablets: readonly { readonly lastSeenAt: Date }[];
}

export interface HomeStation {
  readonly id: string;
  readonly name: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly countryId: string;
  readonly countryName: string;
  readonly checklistCount: number;
  readonly tabletCount: number;
  /** Когда последний раз был на связи любой из планшетов; `null` — планшетов нет. */
  readonly lastSeenAt: Date | null;
  readonly lastSubmissionAt: Date | null;
  readonly status: StationStatus;
}

/** Область главной: что выбрано в фильтре. Незаданное — вся сеть. */
export interface HomeScope {
  readonly countryId?: string;
  readonly storeId?: string;
  readonly stationId?: string;
}

function statusOf(station: NetworkStation): StationStatus {
  if (station.gaps.includes("noChecklist")) return "noChecklist";
  return station.gaps.includes("silent") ? "silent" : "working";
}

function latest(dates: readonly Date[]): Date | null {
  return dates.reduce<Date | null>(
    (max, date) => (max === null || date > max ? date : max),
    null,
  );
}

/** Станции сети вместе с их планшетами. Станция без записи о планшетах — без планшета. */
export function mergeStations(
  network: readonly NetworkStation[],
  tablets: readonly StationTabletsFacts[],
): readonly HomeStation[] {
  const byStation = new Map(tablets.map((row) => [row.stationId, row.tablets]));

  return network.map((station) => {
    const own = byStation.get(station.id) ?? [];
    return {
      id: station.id,
      name: station.name,
      storeId: station.storeId,
      storeName: station.storeName,
      countryId: station.countryId,
      countryName: station.countryName,
      checklistCount: station.checklistCount,
      tabletCount: own.length,
      lastSeenAt: latest(own.map((tablet) => tablet.lastSeenAt)),
      lastSubmissionAt: station.lastSubmissionAt,
      status: statusOf(station),
    };
  });
}

/** Станции внутри выбранной области. Самое узкое заданное условие решает. */
export function inScope(
  stations: readonly HomeStation[],
  scope: HomeScope,
): readonly HomeStation[] {
  return stations.filter(
    (station) =>
      (scope.countryId === undefined ||
        station.countryId === scope.countryId) &&
      (scope.storeId === undefined || station.storeId === scope.storeId) &&
      (scope.stationId === undefined || station.id === scope.stationId),
  );
}

/** Сколько станций работает и сколько всего — первая цифра главной. */
export function countWorking(stations: readonly HomeStation[]): {
  readonly working: number;
  readonly total: number;
} {
  return {
    working: stations.filter((station) => station.status === "working").length,
    total: stations.length,
  };
}

/** Дырки области: у каждой строки «Что не закрыто» своё число. */
export function countGapsOf(stations: readonly HomeStation[]): {
  readonly noChecklist: number;
  readonly silent: number;
} {
  return {
    noChecklist: stations.filter((s) => s.status === "noChecklist").length,
    silent: stations.filter((s) => s.status === "silent").length,
  };
}

export interface StoreSummary {
  readonly storeId: string;
  readonly storeName: string;
  readonly countryName: string;
  readonly total: number;
  readonly working: number;
  readonly withTablet: number;
  readonly lastSubmissionAt: Date | null;
}

/**
 * Сводка по пиццериям — когда пиццерия не выбрана. Вся сеть станциями на одном экране —
 * это сотни строк, которые никто не прочтёт; строка на пиццерию отвечает на вопрос
 * «где смотреть», а нажатие сужает главную до неё.
 */
export function summarizeStores(
  stations: readonly HomeStation[],
): readonly StoreSummary[] {
  const groups = new Map<string, HomeStation[]>();
  for (const station of stations) {
    groups.set(station.storeId, [
      ...(groups.get(station.storeId) ?? []),
      station,
    ]);
  }

  return [...groups.values()]
    .flatMap((group) => {
      // Группа не бывает пустой — её заводит первая же станция; проверка для типов.
      const [first] = group;
      if (first === undefined) return [];
      return {
        storeId: first.storeId,
        storeName: first.storeName,
        countryName: first.countryName,
        total: group.length,
        working: group.filter((s) => s.status === "working").length,
        withTablet: group.filter((s) => s.tabletCount > 0).length,
        lastSubmissionAt: latest(
          group.flatMap((s) =>
            s.lastSubmissionAt === null ? [] : [s.lastSubmissionAt],
          ),
        ),
      };
    })
    .sort(
      (a, b) =>
        a.countryName.localeCompare(b.countryName) ||
        a.storeName.localeCompare(b.storeName),
    );
}
