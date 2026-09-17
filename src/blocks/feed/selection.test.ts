import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

import type { FeedCatalog } from "./options";
import { resolveSelection, screenTimeZone } from "./selection";

const CATALOG: FeedCatalog = {
  countries: [
    { id: "c-kz", name: "Казахстан" },
    { id: "c-uz", name: "Узбекистан" },
  ],
  stores: [
    {
      id: "s-almaty",
      name: "Алматы, Абая 44",
      countryId: "c-kz",
      timezone: "Asia/Almaty",
    },
    {
      id: "s-astana",
      name: "Астана, Кабанбай 12",
      countryId: "c-kz",
      timezone: "Asia/Almaty",
    },
    {
      id: "s-tashkent",
      name: "Ташкент, Амира 3",
      countryId: "c-uz",
      timezone: "Asia/Tashkent",
    },
  ],
  stations: [
    { id: "st-kitchen", name: "Кухня", storeId: "s-almaty" },
    { id: "st-cash", name: "Касса", storeId: "s-almaty" },
    { id: "st-pack", name: "Упаковка", storeId: "s-astana" },
    { id: "st-uz", name: "Кухня", storeId: "s-tashkent" },
  ],
};

describe("resolveSelection", () => {
  it("без фильтров показывает весь справочник", () => {
    const selection = resolveSelection({ period: "today" }, CATALOG);

    expect(selection.countryId).toBeNull();
    expect(selection.stores.map((store) => store.id)).toStrictEqual([
      "s-almaty",
      "s-astana",
      "s-tashkent",
    ]);
    expect(selection.stations).toHaveLength(4);
  });

  it("выбранная страна сужает список пиццерий и станций", () => {
    const selection = resolveSelection(
      { countryId: "c-kz", period: "today" },
      CATALOG,
    );

    expect(selection.stores.map((store) => store.id)).toStrictEqual([
      "s-almaty",
      "s-astana",
    ]);
    expect(selection.stations.map((station) => station.id)).toStrictEqual([
      "st-cash",
      "st-kitchen",
      "st-pack",
    ]);
  });

  it("выбранная пиццерия сужает станции до своих", () => {
    const selection = resolveSelection(
      { storeId: "s-almaty", period: "today" },
      CATALOG,
    );

    expect(selection.stations.map((station) => station.id)).toStrictEqual([
      "st-cash",
      "st-kitchen",
    ]);
  });

  it("пиццерия чужой страны из фильтра выпадает, а не даёт заведомо пустую ленту", () => {
    const selection = resolveSelection(
      { countryId: "c-kz", storeId: "s-tashkent", period: "today" },
      CATALOG,
    );

    expect(selection.storeId).toBeNull();
  });

  it("станция чужой пиццерии из фильтра выпадает вместе с ней", () => {
    const selection = resolveSelection(
      { storeId: "s-almaty", stationId: "st-pack", period: "today" },
      CATALOG,
    );

    expect(selection.stationId).toBeNull();
  });

  it("несуществующие идентификаторы не доходят до запроса", () => {
    const selection = resolveSelection(
      {
        countryId: "нет-такой",
        storeId: "нет",
        stationId: "нет",
        period: "today",
      },
      CATALOG,
    );

    expect(selection.countryId).toBeNull();
    expect(selection.storeId).toBeNull();
    expect(selection.stationId).toBeNull();
  });

  it("станция без выбранной пиццерии оставляет и станцию, и её страну для запроса", () => {
    const selection = resolveSelection(
      { stationId: "st-pack", period: "today" },
      CATALOG,
    );

    expect(selection.stationId).toBe("st-pack");
    expect(selection.storeId).toBeNull();
  });
});

describe("screenTimeZone", () => {
  it("пояс выбранной пиццерии", () => {
    expect(
      screenTimeZone(
        resolveSelection({ storeId: "s-tashkent", period: "today" }, CATALOG),
      ),
    ).toBe("Asia/Tashkent");
  });

  it("страна с единственным поясом — этот пояс", () => {
    expect(
      screenTimeZone(
        resolveSelection({ countryId: "c-kz", period: "today" }, CATALOG),
      ),
    ).toBe("Asia/Almaty");
  });

  it("пиццерии в разных поясах — пояс площадки, и экран его подписывает", () => {
    const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(screenTimeZone(resolveSelection({ period: "today" }, CATALOG))).toBe(
      fallback,
    );
  });

  it("справочник без пиццерий — тоже пояс площадки, а не отказ", () => {
    const empty: FeedCatalog = { countries: [], stores: [], stations: [] };

    expect(screenTimeZone(resolveSelection({ period: "today" }, empty))).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });
});

describe("screenTimeZone по выбранной станции", () => {
  it("станция задаёт пиццерию, а с ней и пояс экрана, даже когда пиццерия не выбрана", () => {
    expect(
      screenTimeZone(
        resolveSelection({ stationId: "st-uz", period: "today" }, CATALOG),
      ),
    ).toBe("Asia/Tashkent");
  });
});

describe("названия станций в фильтре", () => {
  it("без выбранной пиццерии станция названа путём: «Кухня» есть в каждой", () => {
    const selection = resolveSelection({ period: "today" }, CATALOG);

    expect(selection.stations.map((station) => station.name)).toStrictEqual([
      "Алматы, Абая 44 · Касса",
      "Алматы, Абая 44 · Кухня",
      "Астана, Кабанбай 12 · Упаковка",
      "Ташкент, Амира 3 · Кухня",
    ]);
  });

  it("с выбранной пиццерией путь не повторяется: список и так её", () => {
    const selection = resolveSelection(
      { storeId: "s-almaty", period: "today" },
      CATALOG,
    );

    expect(selection.stations.map((station) => station.name)).toStrictEqual([
      "Касса",
      "Кухня",
    ]);
  });
});

/**
 * Подпись под фильтрами — единственное место, где экран объявляет своё допущение о том,
 * что такое «сегодня» у сети из нескольких поясов. Она показывается ТОЛЬКО когда пояс
 * неоднозначен (`isTimeZoneAmbiguous`), то есть когда пиццерий на экране несколько и
 * поясá у них разные, — значит и говорить обязана именно про этот случай.
 *
 * До T183 она говорила «Период считается по времени пиццерии: Europe/Belgrade»: называла
 * пояс МАШИНЫ временем пиццерии, хотя ни у одной пиццерии на экране такого пояса нет.
 * Строки ленты при этом показывались верно — каждая по поясу своей пиццерии, — то есть
 * врала ровно подпись, и проверки под ней не было ни одной.
 *
 * Сторож держит четыре факта формулировки, а не её красоту: сказано, что поясá разные;
 * названный пояс объявлен общим для всех, а не чьим-то; время строк объявлено местным;
 * и прежняя формулировка не вернулась. Проверяется на обоих языках: пропавший ключ
 * next-intl не роняет, а рисует сам ключ.
 */
const NOTE_CASES = [
  {
    locale: "ru",
    messages: ru,
    mixedZones: "в разных часовых поясах",
    commonZone: "для всех",
    ownZone: "своей пиццерии",
    oldClaim: "по времени пиццерии",
  },
  {
    locale: "en",
    messages: en,
    mixedZones: "different time zones",
    commonZone: "for all",
    ownZone: "own time",
    oldClaim: "in store time",
  },
] as const;

const NOTE_ZONE = "Europe/Belgrade";

function zoneNote(locale: string, messages: typeof ru | typeof en): string {
  const t = createTranslator({ locale, messages, namespace: "feed.filters" });
  return t("timeZoneMixed", { zone: NOTE_ZONE });
}

describe("подпись пояса под фильтрами", () => {
  it.each(NOTE_CASES)("$locale: названа словами, а не ключом", (variant) => {
    const text = zoneNote(variant.locale, variant.messages);

    expect(text).not.toBe("");
    expect(text).not.toContain("timeZoneMixed");
  });

  it.each(NOTE_CASES)("$locale: называет сам пояс", (variant) => {
    expect(zoneNote(variant.locale, variant.messages)).toContain(NOTE_ZONE);
  });

  it.each(NOTE_CASES)(
    "$locale: объясняет, почему пояс вообще назван — они разные",
    (variant) => {
      expect(zoneNote(variant.locale, variant.messages)).toContain(
        variant.mixedZones,
      );
    },
  );

  it.each(NOTE_CASES)(
    "$locale: названный пояс объявлен общим для всех, а не поясом пиццерии",
    (variant) => {
      const text = zoneNote(variant.locale, variant.messages);

      expect(text).toContain(variant.commonZone);
      expect(text).not.toContain(variant.oldClaim);
    },
  );

  it.each(NOTE_CASES)(
    "$locale: время строк объявлено местным — иначе общий пояс прочитают как пояс экрана",
    (variant) => {
      expect(zoneNote(variant.locale, variant.messages)).toContain(
        variant.ownZone,
      );
    },
  );
});
