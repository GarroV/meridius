// Привязанные планшеты: опознание по строке, привязка, отвязка и список для кабинета.
//
// Запросы свои, а не заказаны в блоке `data`: так устроены границы проекта (D024).
import { and, asc, eq, lte } from "drizzle-orm";

import { countries, devices, getDb, stations, stores } from "@/blocks/data";

const MILLISECONDS = 1000;

/**
 * Как часто обновляется «был на связи». Пять минут: запись при каждой отрисовке
 * превратила бы просмотр чек-листа в поток записей в базу, а список в кабинете отвечает
 * на вопрос «планшет вообще жив», где минуты значения не имеют.
 */
export const SEEN_REFRESH_SECONDS = 5 * 60;

const UUID_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/**
 * Похож ли опознаватель на тот, что мы выдавали. Проверяется ДО похода в базу: значение
 * едет в куке, а куку пишет кто угодно, и `uuid` не того вида уронил бы запрос ошибкой
 * типа — то есть подделанная кука отвечала бы пятисоткой вместо «планшет не узнан».
 */
export function isDeviceId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Привязка: опознаватель (он же в куке) и станция, чей чек-лист показывает планшет. */
export interface PairedDevice {
  readonly id: string;
  readonly stationId: string;
}

export interface PairDeviceInput {
  readonly stationId: string;
  /**
   * Опознаватель из куки этого же планшета, если он уже был привязан. Прежняя строка
   * снимается той же транзакцией: иначе в списке кабинета остался бы призрак — привязка,
   * к которой уже никто не придёт, потому что кука у планшета новая.
   */
  readonly previousDeviceId?: string | null;
}

/** Привязывает планшет к станции и снимает его прежнюю привязку, если она была. */
export async function pairDevice(
  input: PairDeviceInput,
  now: Date,
): Promise<PairedDevice> {
  const previous = input.previousDeviceId ?? null;

  return getDb().transaction(async (tx) => {
    if (previous !== null && isDeviceId(previous)) {
      await tx.delete(devices).where(eq(devices.id, previous));
    }

    const rows = await tx
      .insert(devices)
      .values({
        stationId: input.stationId,
        pairedAt: now,
        lastSeenAt: now,
      })
      .returning({ id: devices.id, stationId: devices.stationId });

    const row = rows[0];
    if (row === undefined) {
      throw new Error("Привязка планшета: строка устройства не завелась");
    }
    return row;
  });
}

/**
 * Живая ли привязка. Спрашивается на КАЖДЫЙ запрос привязанной вкладки: подпись куки
 * без живой строки не значит ничего, и отвязка из кабинета обязана действовать тем же
 * мигом, а не после истечения куки через год.
 */
export async function findPairedDevice(
  id: string,
): Promise<PairedDevice | null> {
  if (!isDeviceId(id)) return null;

  const [row] = await getDb()
    .select({ id: devices.id, stationId: devices.stationId })
    .from(devices)
    .where(eq(devices.id, id))
    .limit(1);

  return row ?? null;
}

/** Отвязывает планшет. `false` — строки уже не было: отвязали дважды или станцию удалили. */
export async function unpairDevice(id: string): Promise<boolean> {
  if (!isDeviceId(id)) return false;

  const rows = await getDb()
    .delete(devices)
    .where(eq(devices.id, id))
    .returning({ id: devices.id });

  return rows.length > 0;
}

/**
 * Отмечает, что планшет был на связи. Пишет, только если прошлая отметка старше порога, —
 * условие стоит в самом запросе, поэтому лишней записи не случается и при одновременных
 * отрисовках.
 */
export async function touchDeviceSeen(id: string, now: Date): Promise<void> {
  if (!isDeviceId(id)) return;

  const threshold = new Date(
    now.getTime() - SEEN_REFRESH_SECONDS * MILLISECONDS,
  );
  await getDb()
    .update(devices)
    .set({ lastSeenAt: now })
    .where(and(eq(devices.id, id), lte(devices.lastSeenAt, threshold)));
}

/** Строка списка устройств: планшет и весь путь до него — страна, пиццерия, станция. */
export interface PairedDeviceRow {
  readonly deviceId: string;
  readonly stationId: string;
  readonly stationName: string;
  readonly storeName: string;
  readonly countryName: string;
  readonly pairedAt: Date;
  readonly lastSeenAt: Date;
}

/**
 * Все привязанные планшеты сети. Список нужен не для красоты: привязка переживает
 * перевыпуск кода станции, поэтому чужой планшет в списке — единственный способ заметить
 * подобранный доступ.
 */
export async function listPairedDevices(): Promise<PairedDeviceRow[]> {
  return getDb()
    .select({
      deviceId: devices.id,
      stationId: devices.stationId,
      stationName: stations.name,
      storeName: stores.name,
      countryName: countries.name,
      pairedAt: devices.pairedAt,
      lastSeenAt: devices.lastSeenAt,
    })
    .from(devices)
    .innerJoin(stations, eq(devices.stationId, stations.id))
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .innerJoin(countries, eq(stores.countryId, countries.id))
    .orderBy(
      asc(countries.name),
      asc(stores.name),
      asc(stations.name),
      asc(devices.pairedAt),
    );
}
