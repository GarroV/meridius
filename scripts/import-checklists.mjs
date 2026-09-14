#!/usr/bin/env node
// Заводит боевой пакет чек-листов из файла ВНЕ репозитория.
//
// Почему файл снаружи: репозиторий публичный (D037), а содержание пакета —
// внутренний материал компании (issue #55). Скрипт живёт в репозитории, данные — нет.
// Путь к файлу передаётся параметром, значения по умолчанию у него нет сознательно:
// иначе однажды кто-нибудь положит пакет рядом и закоммитит.
//
// Прогон идемпотентен: опознаватели строк выводятся из ключей пакета, поэтому второй
// запуск заменяет контур тем же составом, а коды станций не меняются — напечатанные
// наклейки продолжают работать.
//
// ВРЕМЕННЫЙ ПОРЯДОК. Обход раскладывается на почасовые чек-листы, потому что
// регулярности в продукте ещё нет (T134—T138). Каждый обход получает СВОЮ станцию:
// getPublishedVersionForStation отдаёт станции ровно один чек-лист (`limit(1)`), и
// почасовой обход на той же станции молча перекрыл бы открытие смены.
//
// Запуск:  node scripts/import-checklists.mjs <путь к packet.json>
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./src-resolve-hook.mjs", import.meta.url);

try {
  process.loadEnvFile();
} catch {
  // .env может не быть — тогда работают переменные окружения снаружи.
}

const packetPath = process.argv[2];
if (!packetPath) {
  console.error("Укажите путь к файлу пакета вне репозитория:");
  console.error("  node scripts/import-checklists.mjs ~/…/packet.json");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Нет DATABASE_URL: скопируйте .env.example в .env");
  process.exit(1);
}

const {
  getDb,
  countries,
  stores,
  stations,
  checklists,
  checklistVersions,
  submissions,
} = await import("../src/blocks/data/index.ts");
const { STATION_CODE_ALPHABET, STATION_CODE_LENGTH } =
  await import("../src/blocks/catalog/index.ts");
const { stationScanUrl } = await import("../src/blocks/qr/scan-url.ts");
const { eq, inArray } = await import("drizzle-orm");

const NAMESPACE = "meridius/import/v1";

/** Опознаватель, выведенный из ключа: тот же ключ — та же строка при каждом прогоне. */
function idFor(kind, key) {
  const h = createHash("sha256")
    .update(`${NAMESPACE}:${kind}:${key}`)
    .digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `4${h.slice(13, 16)}`,
    ((Number.parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16) +
      h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

/** Код станции — тоже из ключа: перезапуск не ломает уже наклеенные QR (D006). */
function codeFor(key) {
  const h = createHash("sha256").update(`${NAMESPACE}:code:${key}`).digest();
  let code = "";
  for (let i = 0; i < STATION_CODE_LENGTH; i += 1) {
    code += STATION_CODE_ALPHABET[h[i] % STATION_CODE_ALPHABET.length];
  }
  return code;
}

const pad = (n) => String(n).padStart(2, "0");

function itemOf(raw, hour) {
  const zone = raw.zones?.[pad(hour)];
  const suffix = zone
    ? { ru: ` — ${zone[0]}`, en: ` — ${zone[1]}` }
    : { ru: "", en: "" };
  const item = {
    id: randomUUID(),
    title: { ru: raw.ru + suffix.ru, en: raw.en + suffix.en },
    type: raw.type ?? "bool",
    severity: raw.sev ?? "normal",
  };
  if (raw.range) {
    item.min = raw.range[0];
    item.max = raw.range[1];
  }
  return item;
}

/** Разворот обхода в почасовые чек-листы — временный порядок, см. шапку. */
function expandRound(round) {
  const from = Number.parseInt(round.from.slice(0, 2), 10);
  const to = Number.parseInt(round.to.slice(0, 2), 10);
  const out = [];
  for (let hour = from; hour < to; hour += round.everyHours) {
    const next = Math.min(hour + round.everyHours, to);
    out.push({
      key: `${round.station}/${pad(hour)}`,
      station: round.station,
      window: [`${pad(hour)}:00`, `${pad(next)}:00`],
      title: {
        ru: `${round.title.ru} · ${pad(hour)}:00`,
        en: `${round.title.en} · ${pad(hour)}:00`,
      },
      sections: [
        {
          id: randomUUID(),
          title: {
            ru: `Обход ${pad(hour)}:00`,
            en: `Round at ${pad(hour)}:00`,
          },
          source: "own",
          items: round.items.map((raw) => itemOf(raw, hour)),
        },
      ],
    });
  }
  return out;
}

const packet = JSON.parse(readFileSync(packetPath, "utf8"));

const countryId = idFor("country", packet.country.name);
const storeId = idFor("store", packet.store.name);
const stationIds = new Map(
  packet.stations.map((s) => [s.key, idFor("station", s.key)]),
);

const plain = packet.checklists.map((c, i) => ({
  key: `${c.station}/${i}`,
  station: c.station,
  window: c.window,
  title: c.title,
  sections: c.sections.map((s) => ({
    id: randomUUID(),
    title: s.title,
    source: "own",
    items: s.items.map((raw) => itemOf(raw)),
  })),
}));
const rounds = (packet.rounds ?? []).flatMap((r) => expandRound(r));
const all = [...plain, ...rounds];

for (const c of all) {
  if (!stationIds.has(c.station)) {
    console.error(
      `Чек-лист «${c.title.ru}» ссылается на станцию «${c.station}», которой нет в пакете`,
    );
    process.exit(1);
  }
}

const db = getDb();
const now = new Date();

try {
  const summary = await db.transaction(async (tx) => {
    // Снятие прежнего контура — в порядке внешних ключей. Заполнения снимаются вместе
    // с версиями: версии ссылаются на них ограничением restrict, и без этого шага
    // повторный прогон упал бы на первом же заполненном чек-листе.
    const stationIdList = [...stationIds.values()];
    const oldChecklists = await tx
      .select({ id: checklists.id })
      .from(checklists)
      .where(inArray(checklists.stationId, stationIdList));
    const oldIds = oldChecklists.map((r) => r.id);

    if (oldIds.length > 0) {
      const oldVersions = await tx
        .select({ id: checklistVersions.id })
        .from(checklistVersions)
        .where(inArray(checklistVersions.checklistId, oldIds));
      const versionIds = oldVersions.map((r) => r.id);
      if (versionIds.length > 0) {
        await tx
          .delete(submissions)
          .where(inArray(submissions.versionId, versionIds));
        await tx
          .delete(checklistVersions)
          .where(inArray(checklistVersions.id, versionIds));
      }
      await tx.delete(checklists).where(inArray(checklists.id, oldIds));
    }
    await tx.delete(stations).where(inArray(stations.id, stationIdList));
    await tx.delete(stores).where(eq(stores.id, storeId));
    await tx.delete(countries).where(eq(countries.id, countryId));

    await tx.insert(countries).values({
      id: countryId,
      name: packet.country.name,
      locale: packet.country.locale,
    });
    await tx.insert(stores).values({
      id: storeId,
      countryId,
      name: packet.store.name,
      timezone: packet.store.timezone,
    });
    await tx.insert(stations).values(
      packet.stations.map((s) => ({
        id: stationIds.get(s.key),
        storeId,
        name: s.name.ru,
        code: codeFor(s.key),
      })),
    );

    for (const c of all) {
      const checklistId = idFor("checklist", c.key);
      const stationId = stationIds.get(c.station);
      await tx.insert(checklists).values({
        id: checklistId,
        stationId,
        title: c.title,
        windowStart: c.window[0],
        windowEnd: c.window[1],
      });
      // Опубликованная версия и черновик рядом: методист правит черновик дальше,
      // а станция отдаёт опубликованное (D011).
      await tx.insert(checklistVersions).values([
        {
          id: idFor("version", c.key),
          checklistId,
          versionNumber: 1,
          status: "published",
          stationId,
          sections: c.sections,
          publishedAt: now,
        },
        {
          id: idFor("draft", c.key),
          checklistId,
          versionNumber: null,
          status: "draft",
          stationId: null,
          sections: c.sections,
        },
      ]);
    }

    return { removed: oldIds.length };
  });

  const origin =
    process.env.PUBLIC_BASE_URL ||
    `http://localhost:${process.env.PORT || "3100"}`;

  console.log("Пакет заведён.");
  console.log(`  снято чек-листов прошлого прогона: ${summary.removed}`);
  console.log(
    `  станций ${packet.stations.length} · чек-листов ${all.length} (разовых ${plain.length}, почасовых ${rounds.length})`,
  );
  console.log(
    `  пунктов ${all.reduce((n, c) => n + c.sections.reduce((m, s) => m + s.items.length, 0), 0)}`,
  );
  console.log("\nСсылки станций — то, что уходит внутрь напечатанного QR:");
  for (const s of packet.stations) {
    console.log(
      `  ${s.name.ru}\n    ${stationScanUrl(origin, codeFor(s.key))}`,
    );
  }
} finally {
  await globalThis.meridiusPool?.end();
}
