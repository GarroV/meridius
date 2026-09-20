import { describe, expect, it } from "vitest";

import { stationCodeFromPath } from "./params";

/**
 * `stationCodeFromPath` обязана разбирать адрес РОВНО так, как его разберёт сам маршрут
 * `s/[code]` — иначе посредник назовёт разметке код, которого страница не увидит (или
 * наоборот), и язык документа снова разъедется с текстом, как в T270.
 */
describe("код станции из адреса — так же, как его разберёт маршрут", () => {
  it("обычный код одним сегментом отдаётся как есть", () => {
    expect(stationCodeFromPath("/s/abcdefghjk")).toBe("abcdefghjk");
  });

  it("адрес не публичного маршрута кода не несёт", () => {
    // Не `/s/...` — значит пиццерии здесь нет и называть язык документа не по чему.
    expect(stationCodeFromPath("/admin/checklists/17")).toBeNull();
    expect(stationCodeFromPath("/")).toBeNull();
  });

  it("голый `/s/` без кода — пустой сегмент, а не код из пустой строки", () => {
    expect(stationCodeFromPath("/s/")).toBeNull();
  });

  it("два сегмента и больше не подходят: такого маршрута нет", () => {
    // Маршрут `s/[code]` — один динамический сегмент. Назвать пиццерию по `/s/abc/def`
    // значило бы объявить язык страницы, которой не существует.
    expect(stationCodeFromPath("/s/abc/def")).toBeNull();
    expect(stationCodeFromPath("/s/abc/def/ghi")).toBeNull();
  });

  it("закодированный сегмент разбирается так же, как его разберёт сам маршрут", () => {
    // Странице `params.code` достаётся уже разобранным через `decodeURIComponent`.
    // Не сделай это здесь — посредник и страница сравнивали бы разные строки.
    expect(stationCodeFromPath("/s/%41Bc")).toBe("ABc");
  });

  it("испорченная последовательность процентов даёт null, а не падение", () => {
    // `decodeURIComponent` на такой строке бросает URIError. Посредник обслуживает
    // каждый запрос на `/s/:path*` — упасть здесь значило бы уронить весь публичный
    // экран из-за одного кривого адреса, а не просто не узнать пиццерию.
    expect(stationCodeFromPath("/s/%E0%A4%A")).toBeNull();
  });
});
