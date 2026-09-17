import { describe, expect, it } from "vitest";

import { formatStationTime } from "./station-time";

/**
 * Время на экране заполнения. Проверки нарочно стоят в поясах, заведомо не равных
 * поясу машины прогона: ошибку «взяли пояс машины» дневной прогон в родном поясе
 * не показал бы вовсе — ровно так она и дожила до пересъёмки (T234).
 */
describe("formatStationTime", () => {
  // 2026-09-18 21:52 UTC. В Токио это уже следующие сутки, в Нью-Йорке — прежний вечер.
  const MOMENT = Date.parse("2026-09-18T21:52:00Z");

  it("час считается в поясе пиццерии, а не в поясе машины", () => {
    expect(formatStationTime(MOMENT, "Asia/Tokyo", "ru")).toBe("06:52");
    expect(formatStationTime(MOMENT, "America/New_York", "ru")).toBe("17:52");
    expect(formatStationTime(MOMENT, "UTC", "ru")).toBe("21:52");
  });

  it("сутки круглые на обоих языках: у английской локали свой двенадцатичасовой формат", () => {
    expect(formatStationTime(MOMENT, "Europe/Amsterdam", "en")).toBe("23:52");
    expect(formatStationTime(MOMENT, "Europe/Amsterdam", "ru")).toBe("23:52");
  });

  it("полночь пишется нулём, а не двадцатью четырьмя", () => {
    // 00:30 по Амстердаму — тот самый час, на котором ломаются самодельные форматы.
    const midnight = Date.parse("2026-09-18T22:30:00Z");
    expect(formatStationTime(midnight, "Europe/Amsterdam", "ru")).toBe("00:30");
    expect(formatStationTime(midnight, "Europe/Amsterdam", "en")).toBe("00:30");
  });

  it("принимает и миг числом, и готовую дату", () => {
    expect(formatStationTime(new Date(MOMENT), "Asia/Tokyo", "ru")).toBe(
      formatStationTime(MOMENT, "Asia/Tokyo", "ru"),
    );
  });
});
