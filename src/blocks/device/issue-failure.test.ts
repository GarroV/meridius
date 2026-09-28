// Разбор отказа выпуска пина (#162): «попробуйте ещё раз» уместно только там, где повтор
// помогает. На стенде 25.09 фраза печаталась на отсутствующую таблицу, и владелец
// повторял бесконечно. Ошибка разбора молчит — человек видит правдоподобный совет, —
// поэтому проверки написаны до кода.
import { describe, expect, it } from "vitest";

import { classifyIssueFailure } from "./issue-failure";
import { PinsExhaustedError } from "./pin-errors";

/** Как Drizzle заворачивает ошибку драйвера: код лежит в `cause`. */
function wrapped(code: string): Error {
  return new Error("Failed query", {
    cause: Object.assign(new Error("pg"), { code }),
  });
}

describe("разбор отказа выпуска пина", () => {
  it("станции больше нет — повтор не поможет, нужно обновить страницу", () => {
    // Внешний ключ: станцию удалили, пока управляющий смотрел на её панель.
    expect(classifyIssueFailure(wrapped("23503"))).toBe("stationGone");
  });

  it("нет таблицы или колонки — база не готова, это не временно", () => {
    // Ровно случай #162: миграция не накачена на площадке.
    expect(classifyIssueFailure(wrapped("42P01"))).toBe("broken");
    expect(classifyIssueFailure(wrapped("42703"))).toBe("broken");
  });

  it("обрыв связи с базой и её перегрузка — временно", () => {
    for (const code of [
      "08006",
      "08001",
      "57P01",
      "57P03",
      "53300",
      "40001",
      "40P01",
    ]) {
      expect(classifyIssueFailure(wrapped(code))).toBe("temporary");
    }
  });

  it("отказ подключения на уровне сети — временно", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    expect(classifyIssueFailure(refused)).toBe("temporary");
    expect(
      classifyIssueFailure(
        new Error("Connection terminated due to connection timeout"),
      ),
    ).toBe("temporary");
  });

  it("не нашёлся свободный код — временно: истёкшие коды чистятся следующим выпуском", () => {
    expect(classifyIssueFailure(new PinsExhaustedError())).toBe("temporary");
  });

  it("всё непонятное — не временно: совет повторять без причины и есть ошибка #162", () => {
    expect(classifyIssueFailure(new Error("что-то странное"))).toBe("broken");
    expect(classifyIssueFailure("строка вместо ошибки")).toBe("broken");
    expect(classifyIssueFailure(null)).toBe("broken");
  });
});
