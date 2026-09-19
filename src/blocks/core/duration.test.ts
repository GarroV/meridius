import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { formatDuration } from "./duration";
import { repositoryRoot } from "./repo-copy";

describe("formatDuration", () => {
  it("минуты и секунды через двоеточие, как на эталоне", () => {
    expect(formatDuration(204_000)).toBe("3:24");
  });

  it("секунды всегда двумя знаками", () => {
    expect(formatDuration(48_000)).toBe("0:48");
    expect(formatDuration(65_000)).toBe("1:05");
  });

  it("ноль — это 0:00, а не пустая строка", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("остаток миллисекунд отбрасывается вниз, а не округляется вверх", () => {
    expect(formatDuration(59_999)).toBe("0:59");
  });

  it("от часа и больше показывает часы: 61 минута — это 1:01:00, а не 61:00", () => {
    expect(formatDuration(3_660_000)).toBe("1:01:00");
    expect(formatDuration(3_661_000)).toBe("1:01:01");
  });

  it("отрицательная длительность невозможна, но не роняет экран", () => {
    expect(formatDuration(-5000)).toBe("0:00");
  });

  // Тот самый вход, на котором разошлись квитанция и лента (T256, issue #124):
  // квитанция округляла и печатала «0:03», лента отбрасывала и печатала «0:02».
  // Величина одна, запись одна — значит и строка обязана быть одна.
  it("половина секунды не превращается в лишнюю секунду", () => {
    expect(formatDuration(2500)).toBe("0:02");
    expect(formatDuration(2999)).toBe("0:02");
  });
});

/**
 * Сторож от возврата второй копии. Разъехались экраны не потому, что кто-то выбрал
 * другое правило округления, а потому что у длительности было ДВА независимых
 * форматировщика: правка одного не доходила до другого, и заметил расхождение
 * человек, а не прогон. Сторож читает сами исходники: появится второй — покраснеет.
 */
describe("длительность форматируется в одном месте", () => {
  it("своего форматировщика длительности нет ни у одного блока", () => {
    const root = repositoryRoot();
    const sources = readdirSync(join(root, "src"), {
      recursive: true,
      encoding: "utf8",
    })
      .map((entry) => entry.split("\\").join("/"))
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
      .filter((file) => !file.includes(".test."));

    const offenders = sources
      .filter((file) => file !== "blocks/core/duration.ts")
      .filter((file) =>
        /function\s+formatDuration|const\s+formatDuration\s*=/.test(
          readFileSync(join(root, "src", file), "utf8"),
        ),
      );

    expect(
      offenders,
      "Длительность снова считается на месте: эти файлы объявляют свой formatDuration " +
        "вместо src/blocks/core/duration.ts. Две копии разъезжаются молча — " +
        "ровно так квитанция показала 0:03 там, где лента показывала 0:02.",
    ).toEqual([]);
  });
});
