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
// ОДНА СТАНЦИЯ — ОДИН ЧЕК-ЛИСТ (D082). Периоды суток и обход становятся секциями
// внутри него, а не отдельными чек-листами: сотрудник сканирует одну наклейку и
// видит всю свою работу. Регулярность обхода живёт на пунктах отрезками расписания
// (D075), поэтому почасовые копии чек-листа больше не заводятся.
//
// Блоки библиотеки (`library` в пакете) заводятся, но ни в один чек-лист не
// вставляются: вставка — решение методиста. Блок, вставленный импортом, менялся бы
// при каждой перезаливке пакета в чужих черновиках.
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
  assertValidSchedule,
  checks,
  blocks,
} = await import("../src/blocks/data/index.ts");
const { STATION_CODE_ALPHABET, STATION_CODE_LENGTH } =
  await import("../src/blocks/catalog/index.ts");
const { stationLinkLines } = await import("../src/blocks/qr/station-links.ts");
const { publicBasePath } = await import("../src/blocks/qr/sticker-origin.ts");
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
const MINUTES_IN_HOUR = 60;

function itemOf(raw, extra = {}) {
  const item = {
    id: randomUUID(),
    title: { ru: raw.ru, en: raw.en },
    type: raw.type ?? "bool",
    severity: raw.sev ?? "normal",
    ...extra,
  };
  if (raw.range) {
    item.min = raw.range[0];
    item.max = raw.range[1];
  }
  return item;
}

/**
 * Часы одной зоны — в отрезки расписания. Подряд идущие часы складываются в один
 * отрезок: «08, 09, 10» это «с 08:00 до 11:00 каждый час», а не три отрезка по часу.
 * Конец отрезка — конец периода, а не время последнего обхода (см. `ScheduleSegment`).
 */
function segmentsFromHours(hours, everyHours) {
  const sorted = [...hours].sort((a, b) => a - b);
  const segments = [];
  let from = null;
  let previous = null;
  for (const hour of sorted) {
    if (from === null) {
      from = hour;
    } else if (hour !== previous + everyHours) {
      segments.push({
        from: `${pad(from)}:00`,
        to: `${pad(previous + everyHours)}:00`,
        everyMinutes: everyHours * MINUTES_IN_HOUR,
      });
      from = hour;
    }
    previous = hour;
  }
  if (from !== null) {
    segments.push({
      from: `${pad(from)}:00`,
      to: `${pad(previous + everyHours)}:00`,
      everyMinutes: everyHours * MINUTES_IN_HOUR,
    });
  }
  return segments;
}

/**
 * Пункты обхода с расписанием.
 *
 * Пункт без зон обходится весь период целиком. Пункт с зонами (на бумаге — одна строка,
 * где в каждом часе подписано своё место) разворачивается в пункт НА ЗОНУ: пять мест
 * вместо пятнадцати часов, и у каждого своя регулярность. Это не приём импорта, а ровно
 * то, ради чего регулярность задаётся набором отрезков (D075): «линию начинения смотрим
 * в 8, 9, 10, 14 и 20» — это один пункт с тремя отрезками, а не пять разных проверок.
 */
function roundItems(raw, round) {
  const step = round.everyHours * MINUTES_IN_HOUR;
  if (!raw.zones) {
    return [
      itemOf(raw, {
        schedule: [{ from: round.from, to: round.to, everyMinutes: step }],
      }),
    ];
  }

  const byZone = new Map();
  for (const [hour, zone] of Object.entries(raw.zones)) {
    const key = `${zone[0]}\u0000${zone[1]}`;
    const entry = byZone.get(key) ?? { zone, hours: [] };
    entry.hours.push(Number.parseInt(hour, 10));
    byZone.set(key, entry);
  }

  return [...byZone.values()].map(({ zone, hours }) =>
    itemOf(
      { ...raw, ru: `${raw.ru} — ${zone[0]}`, en: `${raw.en} — ${zone[1]}` },
      { schedule: segmentsFromHours(hours, round.everyHours) },
    ),
  );
}

/** Обход — секция с расписанием на пунктах, а не чек-лист на каждый час. */
function roundPart(round) {
  const items = round.items.flatMap((raw) => roundItems(raw, round));
  for (const item of items) {
    // Сломанное расписание внутри опубликованной версии неисправимо — версии не
    // переписываются (принцип 3, D002), поэтому отказ громкий и здесь, на входе.
    assertValidSchedule(item.schedule);
  }
  return {
    station: round.station,
    window: [round.from, round.to],
    title: round.title,
    sections: [
      {
        id: randomUUID(),
        title: round.title,
        source: "own",
        items,
      },
    ],
  };
}

const MINUTES_IN_DAY = 24 * MINUTES_IN_HOUR;

function minutesOf(time) {
  const [h, m] = time.split(":");
  return Number(h) * MINUTES_IN_HOUR + Number(m);
}

function timeOf(minutes) {
  const inDay = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  return `${pad(Math.floor(inDay / MINUTES_IN_HOUR))}:${pad(inDay % MINUTES_IN_HOUR)}`;
}

/**
 * Окно, накрывающее все периоды станции. Опора перебирается по всем началам: окна
 * идут через полночь («21:00–03:00»), и наивный минимум начала с максимумом конца дал
 * бы сутки наизнанку. Берётся та опора, при которой сутки покрываются короче всего —
 * для смены, работающей с 05:00 до 03:00, это 05:00, а не полночь.
 */
function coveringWindow(windows) {
  let best = null;
  for (const [candidate] of windows) {
    const start = minutesOf(candidate);
    let span = 0;
    for (const [from, to] of windows) {
      const offset =
        (minutesOf(from) - start + MINUTES_IN_DAY) % MINUTES_IN_DAY;
      const length =
        (minutesOf(to) - minutesOf(from) + MINUTES_IN_DAY) % MINUTES_IN_DAY ||
        MINUTES_IN_DAY;
      span = Math.max(span, offset + length);
    }
    if (span > MINUTES_IN_DAY) continue;
    if (best === null || span < best.span) best = { start, span };
  }
  if (best === null) {
    throw new RangeError(
      "Периоды станции не укладываются в сутки: объединить их в один чек-лист нельзя",
    );
  }
  // Ровно сутки записать нечем: база не принимает пустое окно (`checklists_window_not_empty`),
  // а начало, равное концу, читалось бы как ноль минут. Минута в запасе честнее молчания.
  const span = Math.min(best.span, MINUTES_IN_DAY - 1);
  return [timeOf(best.start), timeOf(best.start + span)];
}

/** «Hot shop — opening» → «opening»: в заголовке секции станция уже не нужна. */
function periodName(title) {
  const cut = (text) => {
    const tail = text.split("—").pop().trim();
    return tail === "" ? text : tail;
  };
  const en = cut(title.en);
  return {
    ru: cut(title.ru),
    en: en.charAt(0).toUpperCase() + en.slice(1),
  };
}

/**
 * Один чек-лист на станцию (требование владельца 15.09: «нам нужен 1 станция — 1
 * чеклист, в нем внутри должно быть разделение на утро и вечер»). Периоды суток
 * становятся секциями с часами в заголовке, обход — такой же секцией, только его
 * пункты несут расписание и уезжают в панель обходов сами (D075).
 */
function stationChecklist(stationKey, name, parts) {
  const ordered = [...parts].sort(
    (a, b) => minutesOf(a.window[0]) - minutesOf(b.window[0]),
  );
  const window = coveringWindow(ordered.map((part) => part.window));

  const sections = ordered.flatMap((part) => {
    const period = periodName(part.title);
    const hours = `${part.window[0]}–${part.window[1]}`;
    return part.sections.map((section, index) => ({
      ...section,
      title: {
        // Часы в заголовке секции — единственное место, где сотрудник видит, к какому
        // времени суток относится пачка пунктов: у секции своего окна в продукте нет.
        ru: `${period.ru} ${hours}${part.sections.length > 1 ? ` · ${section.title.ru}` : ""}`,
        en: `${period.en} ${hours}${part.sections.length > 1 ? ` · ${section.title.en}` : ""}`,
      },
      id: section.id ?? `${stationKey}-${String(index)}`,
    }));
  });

  return {
    key: stationKey,
    station: stationKey,
    window,
    title: name,
    sections,
  };
}

const packet = JSON.parse(readFileSync(packetPath, "utf8"));

const countryId = idFor("country", packet.country.name);
const storeId = idFor("store", packet.store.name);
const stationIds = new Map(
  packet.stations.map((s) => [s.key, idFor("station", s.key)]),
);

const plain = packet.checklists.map((c) => ({
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
const rounds = (packet.rounds ?? []).map((r) => roundPart(r));

const parts = new Map();
for (const part of [...plain, ...rounds]) {
  if (!stationIds.has(part.station)) {
    console.error(
      `Чек-лист «${part.title.ru}» ссылается на станцию «${part.station}», которой нет в пакете`,
    );
    process.exit(1);
  }
  parts.set(part.station, [...(parts.get(part.station) ?? []), part]);
}

const stationNames = new Map(packet.stations.map((s) => [s.key, s.name]));
const all = [...parts.entries()].map(([station, list]) =>
  stationChecklist(station, stationNames.get(station), list),
);

// Блоки библиотеки (D011). Заводятся, но никуда не вставляются: вставка блока в
// чек-лист — решение методиста, а не импорта. Опознаватели пунктов выведены из ключа
// блока, а не случайны: иначе каждый прогон подменял бы пункты новыми, и черновик,
// куда блок уже вставили, переставал бы узнавать свои же строки.
const library = (packet.library ?? []).map((b) => ({
  id: idFor("block", b.key),
  title: b.title,
  items: b.items.map((raw, index) =>
    itemOf(raw, { id: idFor("block-item", `${b.key}:${String(index)}`) }),
  ),
}));

const db = getDb();
const now = new Date();

try {
  const summary = await db.transaction(async (tx) => {
    // Снятие прежнего контура — в порядке внешних ключей. Заполнения снимаются вместе
    // с версиями: версии ссылаются на них ограничением restrict, и без этого шага
    // повторный прогон упал бы на первом же заполненном чек-листе.
    //
    // Станции берутся ИЗ БАЗЫ по пиццерии, а не из пакета: пакет описывает, каким
    // контур обязан стать, и станция, которой в нём больше нет, обязана исчезнуть.
    // Список из пакета оставлял бы такую станцию с её наклейкой жить дальше — и
    // перезаливка упиралась бы в снятие самой пиццерии, у которой остался ребёнок.
    const existing = await tx
      .select({ id: stations.id })
      .from(stations)
      .where(eq(stations.storeId, storeId));
    const stationIdList = [
      ...new Set([...existing.map((r) => r.id), ...stationIds.values()]),
    ];
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
        // Отметки обходов ссылаются на версии так же, как заполнения: без их снятия
        // перезаливка пакета упрётся в внешний ключ и не пройдёт вовсе.
        await tx.delete(checks).where(inArray(checks.versionId, versionIds));
        await tx
          .delete(checklistVersions)
          .where(inArray(checklistVersions.id, versionIds));
      }
      await tx.delete(checklists).where(inArray(checklists.id, oldIds));
    }
    await tx.delete(stations).where(inArray(stations.id, stationIdList));
    await tx.delete(stores).where(eq(stores.id, storeId));

    // Страна ПЕРЕИСПОЛЬЗУЕТСЯ, если уже заведена под этим именем, а не создаётся
    // заново: в ней могут стоять чужие пиццерии (демо-контур), и снос страны либо
    // упёрся бы в них внешним ключом, либо завёл бы вторую страну с тем же именем —
    // в списке кабинета они выглядели бы одинаково, и методист выбирал бы наугад.
    const [known] = await tx
      .select({ id: countries.id })
      .from(countries)
      .where(eq(countries.name, packet.country.name))
      .limit(1);

    const country = known?.id ?? countryId;
    if (known === undefined) {
      await tx.delete(countries).where(eq(countries.id, countryId));
      await tx.insert(countries).values({
        id: countryId,
        name: packet.country.name,
        locale: packet.country.locale,
      });
    }

    await tx.insert(stores).values({
      id: storeId,
      countryId: country,
      name: packet.store.name,
      timezone: packet.store.timezone,
    });
    // Имя станции — на языке страны: в базе оно одно, и второго поля под перевод нет.
    // Брать русское всегда значило бы русские станции в английском кабинете (владелец
    // 15.09: «весь интерфейс сейчас на инглише»).
    const stationName = (name) =>
      name[packet.country.locale] ?? name.en ?? name.ru;
    await tx.insert(stations).values(
      packet.stations.map((s) => ({
        id: stationIds.get(s.key),
        storeId,
        name: stationName(s.name),
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

    // Блоки переписываются по своему опознавателю и только по нему: заведённое
    // методистом руками импорт не трогает. Снятия прежних нет по той же причине —
    // блок не принадлежит пиццерии, и «лишний» блок здесь неотличим от чужого.
    for (const block of library) {
      await tx
        .insert(blocks)
        .values({ id: block.id, title: block.title, items: block.items })
        .onConflictDoUpdate({
          target: blocks.id,
          set: { title: block.title, items: block.items, updatedAt: now },
        });
    }

    return { removed: oldIds.length };
  });

  const origin =
    process.env.PUBLIC_BASE_URL ||
    `http://localhost:${process.env.PORT || "3100"}`;

  console.log("Пакет заведён.");
  console.log(`  снято чек-листов прошлого прогона: ${summary.removed}`);
  console.log(
    `  станций ${packet.stations.length} · чек-листов ${all.length} (по одному на станцию: ${plain.length} периодов суток + ${rounds.length} обходов секциями)`,
  );
  console.log(
    `  пунктов ${all.reduce((n, c) => n + c.sections.reduce((m, s) => m + s.items.length, 0), 0)}`,
  );
  console.log(
    `  блоков библиотеки ${library.length} · пунктов в них ${library.reduce((n, b) => n + b.items.length, 0)} (заведены, никуда не вставлены)`,
  );
  console.log("\nСсылки станций — то, что уходит внутрь напечатанного QR:");
  // Имя — на языке страны, ссылка — с базовым путём площадки. И то и другое
  // человек читает глазами и по нему раскладывает наклейки: русское имя в
  // английской стране и ссылка без префикса площадки (она ведёт в 502) выглядят
  // одинаково убедительно и не ловятся ничем, кроме похода на кухню.
  for (const link of stationLinkLines({
    stations: packet.stations,
    locale: packet.country.locale,
    origin,
    basePath: publicBasePath(process.env),
    codeFor: (key) => codeFor(key),
  })) {
    console.log(`  ${link.name}\n    ${link.url}`);
  }
} finally {
  await globalThis.meridiusPool?.end();
}
