// Часы пиццерии на настоящей базе: перевод момента в пояс делает PostgreSQL (D026),
// и заглушкой это не проверить — проверялся бы `Intl` движка, а не то, что считает база.
//
// Все окна здесь считаются ОТ ТЕКУЩЕГО времени, а не написаны числами: иначе проверка
// проходила бы или падала в зависимости от часа прогона.
import { afterAll, describe, expect, test } from "vitest";

import { closeTestDb } from "@/blocks/data/testing/db";
import { createChecklist, createStation } from "@/blocks/data/testing/fixtures";

import { closedWindowNow } from "./station-clock";

afterAll(closeTestDb);

const MINUTES_IN_DAY = 24 * 60;
/** Сдвиг Алматы от UTC — постоянный, перехода на летнее время в зоне нет. */
const ALMATY_SHIFT_MINUTES = 5 * 60;

/** Время UTC как «ЧЧ:ММ» со сдвигом в часах: так же считает проверка сквозного пути. */
function utcTime(shiftHours = 0): string {
  const moment = new Date(Date.now() + shiftHours * 60 * 60 * 1000);
  const hours = String(moment.getUTCHours()).padStart(2, "0");
  return `${hours}:${String(moment.getUTCMinutes()).padStart(2, "0")}`;
}

function minutesOf(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

describe("closedWindowNow", () => {
  test("окно идёт сейчас — сказать нечего", async () => {
    const station = await createStation({ timezone: "UTC" });
    const checklistId = await createChecklist({ stationId: station.stationId });

    const notice = await closedWindowNow(checklistId, {
      start: utcTime(-1),
      end: utcTime(1),
    });

    expect(notice).toBeNull();
  });

  test("окно уже закрыто — сообщение несёт время пиццерии и начало окна", async () => {
    const station = await createStation({ timezone: "UTC" });
    const checklistId = await createChecklist({ stationId: station.stationId });
    const window = { start: utcTime(2), end: utcTime(3) };

    const notice = await closedWindowNow(checklistId, window);

    expect(notice).not.toBeNull();
    expect(notice?.start).toBe(window.start);
    expect(notice?.end).toBe(window.end);
    expect(notice?.opensAt).toBe(window.start);
    // Названный час — час пиццерии, а не выдумка: он совпадает с текущим с точностью
    // до минуты, перевалившей границу между запросом и проверкой.
    expect(
      Math.abs(minutesOf(notice?.now ?? "") - minutesOf(utcTime())),
    ).toBeLessThanOrEqual(1);
  });

  test("часы принадлежат ПИЦЦЕРИИ: два пояса дают время, разнесённое на их сдвиг", async () => {
    const window = { start: utcTime(2), end: utcTime(3) };
    const utcStation = await createStation({ timezone: "UTC" });
    const almatyStation = await createStation({ timezone: "Asia/Almaty" });
    const utcChecklist = await createChecklist({
      stationId: utcStation.stationId,
    });
    const almatyChecklist = await createChecklist({
      stationId: almatyStation.stationId,
    });

    const inUtc = await closedWindowNow(utcChecklist, window);
    const inAlmaty = await closedWindowNow(almatyChecklist, window);

    const shift =
      (minutesOf(inAlmaty?.now ?? "") -
        minutesOf(inUtc?.now ?? "") +
        MINUTES_IN_DAY) %
      MINUTES_IN_DAY;
    // Допуск на минуту: два вердикта считают два запроса, и граница минуты может
    // пройти между ними.
    expect(Math.abs(shift - ALMATY_SHIFT_MINUTES)).toBeLessThanOrEqual(1);
  });

  test("у чек-листа без станции часов нет — вердикта тоже", async () => {
    const checklistId = await createChecklist({ stationId: null });

    const notice = await closedWindowNow(checklistId, {
      start: utcTime(2),
      end: utcTime(3),
    });

    expect(notice).toBeNull();
  });

  test("непонятный опознаватель чек-листа не идёт в базу вовсе", async () => {
    const notice = await closedWindowNow("не-uuid", {
      start: utcTime(2),
      end: utcTime(3),
    });

    expect(notice).toBeNull();
  });
});
