// Подпись одна на весь продукт: её зовут и сессия кабинета, и кука планшета. Ошибка
// здесь молчит — подделанный токен, принятый за свой, выглядит как обычный вход.
// Поэтому проверки написаны до кода и стоят на самом опасном: подделке содержимого,
// чужом секрете и мусоре, который приходит из интернета вместе с кукой.
import { describe, expect, it } from "vitest";

import { openSignedToken, packSignedToken } from "./signed-token";

const SECRET = "secret-secret-secret-secret-secret-1";
const OTHER_SECRET = "secret-secret-secret-secret-secret-2";

describe("подписанный токен", () => {
  it("открывается тем же секретом и отдаёт то, что положили", () => {
    const token = packSignedToken({ v: 1, id: "станция-1" }, SECRET);

    expect(openSignedToken(token, SECRET)).toEqual({ v: 1, id: "станция-1" });
  });

  it("не открывается чужим секретом", () => {
    const token = packSignedToken({ v: 1 }, SECRET);

    expect(openSignedToken(token, OTHER_SECRET)).toBeNull();
  });

  it("не открывается с подменённым содержимым", () => {
    const token = packSignedToken({ v: 1, id: "свой" }, SECRET);
    const forged = Buffer.from(
      JSON.stringify({ v: 1, id: "чужой" }),
      "utf8",
    ).toString("base64url");
    const signature = token.split(".")[1] ?? "";

    expect(openSignedToken(`${forged}.${signature}`, SECRET)).toBeNull();
  });

  it("не открывается без подписи и с подписью другой длины", () => {
    const token = packSignedToken({ v: 1 }, SECRET);
    const payload = token.split(".")[0] ?? "";

    // Сравнение за постоянное время падает на разной длине, если её не проверить
    // заранее: подделанная кука отвечала бы пятисоткой, а это тоже ответ перебору.
    expect(openSignedToken(`${payload}.`, SECRET)).toBeNull();
    expect(openSignedToken(`${payload}.AAAA`, SECRET)).toBeNull();
    expect(openSignedToken(payload, SECRET)).toBeNull();
  });

  it("не открывается на мусоре: кука приходит из интернета", () => {
    expect(openSignedToken("", SECRET)).toBeNull();
    expect(openSignedToken("...", SECRET)).toBeNull();
    expect(openSignedToken("не.токен", SECRET)).toBeNull();
    // Содержимое не JSON, но подпись своя: разбор обязан отказать, а не бросить.
    const payload = Buffer.from("не json", "utf8").toString("base64url");
    const signed = packSignedToken({ v: 1 }, SECRET).split(".")[1] ?? "";
    expect(openSignedToken(`${payload}.${signed}`, SECRET)).toBeNull();
  });
});
