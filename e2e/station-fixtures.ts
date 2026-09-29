// Пиццерия со станциями прямо в базе — общая фикстура сценариев блока QR.
//
// Через экран справочника заводить незачем: сценарии проверяют коды станций, а не чужой
// блок, и лишние шаги делают падение непонятным — упало бы в справочнике, а искали бы в QR.
//
// Живёт отдельным модулем, а не копией в каждом сценарии: копия фикстуры разъезжается
// так же молча, как копия кода, и тогда два сценария сеют разные данные под одним именем.
import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { e2eDatabaseUrl } from "./database";

/** Алфавит кода станции: без похожих знаков (`0`, `1`, `i`, `l`, `o`) — решение D031. */
const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export const STATION_NAMES = ["Касса", "Кухня", "Упаковка"];

export interface SeededStore {
  storeId: string;
  storeName: string;
  countryName: string;
  stationNames: string[];
  /** Id станций в порядке `stationNames` — по ним открывают карточку станции. */
  stationIds: string[];
}

export interface SeedStoreOptions {
  /**
   * Язык страны пиццерии — он же язык её печатных материалов (D122).
   *
   * Умолчание `ru` оставлено прежним нарочно: на нём стоят все сценарии, написанные до
   * того, как язык вообще стал вопросом, и менять его значило бы править их заодно.
   * Явным его делает только тот сценарий, которому важно, ЧЕЙ язык победил.
   */
  readonly countryLocale?: "ru" | "en";
}

function code(): string {
  return Array.from(
    { length: 10 },
    () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)] ?? "z",
  ).join("");
}

export async function seedStore(
  options: SeedStoreOptions = {},
): Promise<SeededStore> {
  const label = randomUUID().slice(0, 8);
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    const country = await pool.query<{ id: string }>(
      "insert into countries (name, locale) values ($1, $2) returning id",
      [`Страна ${label}`, options.countryLocale ?? "ru"],
    );
    const countryId = country.rows[0]?.id;
    const store = await pool.query<{ id: string }>(
      "insert into stores (country_id, name, timezone) values ($1, $2, 'Asia/Almaty') returning id",
      [countryId, `Пиццерия ${label}`],
    );
    const storeId = store.rows[0]?.id;
    if (storeId === undefined)
      throw new Error("Пиццерия для сценария не завелась");

    const stationIds: string[] = [];
    for (const name of STATION_NAMES) {
      const station = await pool.query<{ id: string }>(
        "insert into stations (store_id, name, code) values ($1, $2, $3) returning id",
        [storeId, `${name} ${label}`, code()],
      );
      const stationId = station.rows[0]?.id;
      if (stationId === undefined)
        throw new Error("Станция для сценария не завелась");
      stationIds.push(stationId);
    }

    return {
      storeId,
      storeName: `Пиццерия ${label}`,
      countryName: `Страна ${label}`,
      stationNames: STATION_NAMES.map((name) => `${name} ${label}`),
      stationIds,
    };
  } finally {
    await pool.end();
  }
}
