// Правило, которое иначе живёт только в живом клике: отказ «нужно подтверждение»
// обязан превращаться в карточку подтверждения, а не в красную полосу с ошибкой.
import { describe, expect, test } from "vitest";

import { CatalogError } from "../errors";
import {
  afterDeleteStoreFailure,
  formField,
  hrefOf,
  reissueOutcome,
} from "./outcomes";

const BASE = { countryId: "c", storeId: "s", focus: "store" } as const;

describe("поле формы", () => {
  test("строка приходит как есть, отсутствие поля — пустой строкой", () => {
    const form = new FormData();
    form.set("name", "Алматы, Абая 44");

    expect(formField(form, "name")).toBe("Алматы, Абая 44");
    expect(formField(form, "нет-такого")).toBe("");
  });

  test("файл вместо строки не роняет действие", () => {
    // Форму отправляет браузер, но подделать её может кто угодно: поле-файл
    // не должно приводить к исключению вместо понятного отказа.
    const form = new FormData();
    form.set("name", new File(["данные"], "name.txt"));

    expect(formField(form, "name")).toBe("");
  });
});

describe("отказ при удалении пиццерии", () => {
  test("требование подтверждения ведёт к карточке подтверждения, а не к ошибке", () => {
    const view = afterDeleteStoreFailure(
      BASE,
      new CatalogError("confirmationRequired", "есть станции"),
    );

    expect(view.confirm).toBe("store");
    expect(view.error).toBeUndefined();
  });

  test("запрет по истории ведёт к тексту отказа, а не к подтверждению", () => {
    // Иначе методист получил бы карточку «удалить вместе со станциями?», нажал бы
    // «Удалить» и упёрся бы в тот же отказ — только уже с ощущением, что сломалось.
    const view = afterDeleteStoreFailure(
      BASE,
      new CatalogError("referencedByHistory", "есть заполнения"),
    );

    expect(view.error).toBe("referencedByHistory");
    expect(view.confirm).toBeUndefined();
  });

  test("исходное место в дереве сохраняется в обоих случаях", () => {
    for (const code of [
      "confirmationRequired",
      "referencedByHistory",
    ] as const) {
      const view = afterDeleteStoreFailure(BASE, new CatalogError(code, "…"));

      expect(view.countryId).toBe(BASE.countryId);
      expect(view.storeId).toBe(BASE.storeId);
      expect(view.focus).toBe(BASE.focus);
    }
  });
});

describe("перевыпуск кода станции", () => {
  const REQUEST = {
    countryId: "11111111-1111-4111-8111-111111111111",
    storeId: "22222222-2222-4222-8222-222222222222",
    stationId: "33333333-3333-4333-8333-333333333333",
  } as const;

  test("без подтверждения перевыпуска не происходит — экран спрашивает", () => {
    // Главное тут — НЕ адрес, а то, что второй ветки у неподтверждённого запроса нет:
    // один промах мимо кнопки убивал все напечатанные наклейки станции сразу.
    const outcome = reissueOutcome({ ...REQUEST, confirmed: false });

    expect(outcome.kind).toBe("confirm");
    if (outcome.kind !== "confirm") return;
    expect(outcome.view.confirm).toBe("reissue");
    expect(outcome.view.stationId).toBe(REQUEST.stationId);
    expect(outcome.view.storeId).toBe(REQUEST.storeId);
    expect(outcome.view.countryId).toBe(REQUEST.countryId);
    expect(outcome.view.focus).toBe("station");
  });

  test("после подтверждения — перевыпуск и сразу печать новой наклейки", () => {
    const outcome = reissueOutcome({ ...REQUEST, confirmed: true });

    expect(outcome.kind).toBe("reissue");
    if (outcome.kind !== "reissue") return;

    // Адрес печати именно этой станции, а не листа пиццерии: методист пришёл менять
    // одну наклейку, и искать её среди десятка чужих ему незачем.
    // Место в дереве на случай отказа приходит оттуда же: собирать его в самом
    // действии значило бы держать половину решения там, где её нечем проверить.
    expect(outcome.stationId).toBe(REQUEST.stationId);
    expect(outcome.failView).toStrictEqual({
      countryId: REQUEST.countryId,
      storeId: REQUEST.storeId,
      stationId: REQUEST.stationId,
      focus: "station",
    });

    const url = new URL(outcome.doneHref, "https://example.test");
    expect(url.pathname).toBe("/admin/qr");
    expect(url.searchParams.get("store")).toBe(REQUEST.storeId);
    expect(url.searchParams.get("station")).toBe(REQUEST.stationId);
  });
});

describe("куда вести после действия", () => {
  test("место в дереве превращается в адрес справочника", () => {
    expect(hrefOf({ countryId: "c", focus: "country" })).toBe(
      "/admin/catalog?country=c&focus=country",
    );
  });

  test("готовый адрес уходит как есть — иначе печать подменилась бы справочником", () => {
    expect(hrefOf("/admin/qr?store=s&station=st")).toBe(
      "/admin/qr?store=s&station=st",
    );
  });
});
