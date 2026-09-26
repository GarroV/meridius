// Одна станция со всем, что про неё нужно карточке.
//
// Карточка — это место, где чек-лист, наклейка и планшет наконец встречаются (D151).
// До неё каждый из троих жил в своём разделе, и человек, привязывавший станцию,
// открывал три экрана подряд, ни один из которых не назывался привязкой.
//
// Чтение отдельно от `overview.ts` не ради красоты: список считает по всей сети и
// потому не может позволить себе ни одного лишнего столбца, а карточка читает одну
// строку и берёт всё. Свести их в одно значило бы либо тащить по сети то, что нужно
// одной станции, либо не показать на карточке половины.
import { asc, desc, eq } from "drizzle-orm";

import type { LocalizedText } from "@/blocks/data";
import {
  checklists,
  countries,
  devices,
  getDb,
  stations,
  stores,
  submissions,
} from "@/blocks/data";

/** Чек-лист, висящий на станции. */
interface AttachedChecklist {
  readonly id: string;
  readonly title: LocalizedText;
}

/** Привязанный планшет. Их может быть несколько: две точки входа на одной станции. */
interface PairedTablet {
  readonly id: string;
  readonly pairedAt: Date;
  readonly lastSeenAt: Date;
}

export interface StationDetail {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly codeIssuedAt: Date;
  readonly storeId: string;
  readonly storeName: string;
  readonly countryId: string;
  readonly countryName: string;
  readonly checklists: readonly AttachedChecklist[];
  readonly tablets: readonly PairedTablet[];
  readonly lastSubmissionAt: Date | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Станция по её id, либо `null` — такой станции нет.
 *
 * Некорректный uuid отсеивается до похода в базу: драйвер отвечает на него кодом
 * 22P02, и экран получил бы пятисотку вместо честного «такой станции нет». Тот же
 * приём, что в справочнике и в заполнениях.
 */
export async function getStationDetail(
  id: string,
): Promise<StationDetail | null> {
  if (!UUID_PATTERN.test(id)) return null;

  const db = getDb();

  const [row] = await db
    .select({
      id: stations.id,
      name: stations.name,
      code: stations.code,
      codeIssuedAt: stations.codeIssuedAt,
      storeId: stores.id,
      storeName: stores.name,
      countryId: countries.id,
      countryName: countries.name,
    })
    .from(stations)
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .innerJoin(countries, eq(stores.countryId, countries.id))
    .where(eq(stations.id, id))
    .limit(1);

  if (row === undefined) return null;

  // Три коротких запроса, а не одно соединение: «один ко многим» трижды размножило бы
  // строки друг на друга, и два чек-листа при двух планшетах дали бы четыре строки.
  // Здесь это дороже, чем в списке, ровно на два запроса — но строка одна.
  const [attached, tablets, [latest]] = await Promise.all([
    db
      .select({ id: checklists.id, title: checklists.title })
      .from(checklists)
      .where(eq(checklists.stationId, id))
      .orderBy(asc(checklists.title)),
    db
      .select({
        id: devices.id,
        pairedAt: devices.pairedAt,
        lastSeenAt: devices.lastSeenAt,
      })
      .from(devices)
      .where(eq(devices.stationId, id))
      .orderBy(desc(devices.pairedAt)),
    db
      .select({ submittedAt: submissions.submittedAt })
      .from(submissions)
      .where(eq(submissions.stationId, id))
      .orderBy(desc(submissions.submittedAt))
      .limit(1),
  ]);

  return {
    ...row,
    checklists: attached,
    tablets,
    lastSubmissionAt: latest?.submittedAt ?? null,
  };
}
