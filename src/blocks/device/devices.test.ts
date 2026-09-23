// Живая строка устройства — это и есть право планшета показывать чек-лист станции:
// подпись куки без строки не значит ничего (дизайн привязки, «Отвязка мгновенная»).
// Поэтому проверки написаны ДО кода и идут на настоящей базе.
//
// Здесь только то, чья ошибка молчит: опознание планшета, мгновенная отвязка, снятие
// прежней привязки и то, что снятие не задевает соседний планшет той же станции.
// Список устройств, отметка «был на связи» и экраны проверяются запуском — тест на них
// пересказал бы реализацию и был бы переписан при первой же правке.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDb, stations } from "@/blocks/data";
import { createStation } from "@/blocks/data/testing/fixtures";

import { findPairedDevice, pairDevice, unpairDevice } from "./devices";

const NOW = new Date("2026-09-23T10:00:00Z");
const SECOND = 1000;

function later(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * SECOND);
}

describe("привязка планшета", () => {
  it("заводит строку, по которой планшет узнаётся", async () => {
    const { stationId, stationCode } = await createStation();

    const device = await pairDevice({ stationId }, NOW);

    expect(await findPairedDevice(device.id)).toEqual({
      id: device.id,
      stationId,
      stationCode,
    });
  });

  it("отдаёт код станции ЗАНОВО: перевыпуск (D006) привязку не задевает", async () => {
    // Ради этого в куке и в строке устройства кода нет вовсе: закреплённая вкладка
    // после перевыпуска вела бы в отказ — с этого дизайн и начинался.
    const { stationId } = await createStation();
    const device = await pairDevice({ stationId }, NOW);
    const reissued = "переизданныйкод";

    await getDb()
      .update(stations)
      .set({ code: reissued })
      .where(eq(stations.id, stationId));

    expect(await findPairedDevice(device.id)).toEqual({
      id: device.id,
      stationId,
      stationCode: reissued,
    });
  });

  it("снимает прежнюю строку того же планшета: призрака в списке не остаётся", async () => {
    const first = await createStation();
    const second = await createStation();
    const before = await pairDevice({ stationId: first.stationId }, NOW);

    const after = await pairDevice(
      { stationId: second.stationId, previousDeviceId: before.id },
      later(10),
    );

    expect(await findPairedDevice(before.id)).toBeNull();
    expect(await findPairedDevice(after.id)).toEqual({
      id: after.id,
      stationId: second.stationId,
      stationCode: second.stationCode,
    });
  });

  it("не задевает соседний планшет той же станции", async () => {
    // Два планшета на одной станции работают оба (дизайн, краевые случаи). Если снятие
    // прежней привязки сметало бы станцию целиком, соседний планшет отвязался бы молча:
    // человек у него увидел бы «введите новый код» без единой причины.
    const { stationId, stationCode } = await createStation();
    const first = await pairDevice({ stationId }, NOW);

    const second = await pairDevice({ stationId }, later(60));

    expect(await findPairedDevice(first.id)).toEqual({
      id: first.id,
      stationId,
      stationCode,
    });
    expect(await findPairedDevice(second.id)).toEqual({
      id: second.id,
      stationId,
      stationCode,
    });
  });
});

describe("отвязка", () => {
  it("снимает строку, и планшет перестаёт узнаваться тем же мигом", async () => {
    const { stationId } = await createStation();
    const device = await pairDevice({ stationId }, NOW);

    expect(await unpairDevice(device.id)).toBe(true);

    expect(await findPairedDevice(device.id)).toBeNull();
  });

  it("уходит каскадом вместе с удалённой станцией", async () => {
    const { stationId } = await createStation();
    const device = await pairDevice({ stationId }, NOW);

    await getDb().delete(stations).where(eq(stations.id, stationId));

    expect(await findPairedDevice(device.id)).toBeNull();
  });
});

describe("опознание планшета", () => {
  it("не узнаёт неизвестный опознаватель", async () => {
    expect(
      await findPairedDevice("2f1c9a3e-0000-4000-8000-000000000000"),
    ).toBeNull();
  });

  it("не падает на мусоре из куки: она приходит из интернета", async () => {
    // Опознаватель едет в куке, а куку пишет кто угодно. Значение не того вида — это
    // отказ узнать планшет, а не ошибка сервера: иначе страница отдавала бы пятисотку
    // на подделанную куку, и это само по себе было бы ответом перебору.
    expect(await findPairedDevice("не uuid")).toBeNull();
    expect(await findPairedDevice("")).toBeNull();
    expect(await findPairedDevice("'; drop table devices; --")).toBeNull();
  });
});
