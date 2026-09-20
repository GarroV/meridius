// Состояние публикации: говорит ли она методисту, что версию сегодня никто не увидит
// (T275).
//
// Почему проверка живёт здесь, а не только в сквозном сценарии. Вердикт об окне считает
// `window-visibility` и там же проверен; часы пиццерии считает `station-clock` и тоже
// проверен. Но между ними стоит САМО ДЕЙСТВИЕ, и ошибиться можно ровно в нём: посчитать
// окно до публикации (тогда состояние отстаёт от того, что уже уехало на станцию), взять
// окно не из отправленной формы, а из базы (тогда правка окна в этом же нажатии
// потеряется), или просто не вложить вердикт в состояние — экран промолчит, а всё
// остальное останется зелёным. Ни один из трёх промахов не виден чтением кода.
//
// Приём взят у действий справочника и листа печати (`catalog/ui/delete-country-action`,
// `qr/ui/reissue-action`): мимо экрана вызывается само действие, а наружу подменяется
// только то, чего в проверке быть не может, — охрана входа и кэш Next. Слой данных
// НЕ подменяется: час пиццерии обязан прийти из базы, иначе проверка сторожила бы
// заглушку вместо обещания.
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

import { closeTestDb } from "@/blocks/data/testing/db";
import {
  createChecklist,
  createStation,
  sampleSections,
} from "@/blocks/data/testing/fixtures";

const calls = vi.hoisted(() => ({
  admin: 0,
  revalidated: [] as string[],
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    calls.revalidated.push(path);
  },
}));

vi.mock("@/blocks/auth/guard", () => ({
  requireAdmin: () => {
    calls.admin += 1;
    return Promise.resolve();
  },
}));

const { submitPublish } = await import("./actions");
const { INITIAL_EDITOR_STATE } = await import("./action-state");

afterAll(closeTestDb);

beforeEach(() => {
  calls.revalidated.length = 0;
  calls.admin = 0;
});

/** Время UTC как «ЧЧ:ММ» со сдвигом в часах: пиццерии проверки заведены в зоне UTC. */
function utcTime(shiftHours: number): string {
  const moment = new Date(Date.now() + shiftHours * 60 * 60 * 1000);
  const hours = String(moment.getUTCHours()).padStart(2, "0");
  return `${hours}:${String(moment.getUTCMinutes()).padStart(2, "0")}`;
}

function minutesOf(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** Форма ровно такая, какую отправляет шапка редактора (`HiddenState`). */
function publishForm(
  checklistId: string,
  window: { start: string; end: string },
  label: string,
): FormData {
  const form = new FormData();
  form.append("checklistId", checklistId);
  form.append("locale", "ru");
  form.append("title", `Открытие смены ${label}`);
  form.append("stationId", "");
  form.append("window", `${window.start}|${window.end}`);
  form.append("sections", JSON.stringify(sampleSections(label)));
  return form;
}

/**
 * Чек-лист, привязанный к станции пиццерии в зоне UTC: час пиццерии совпадает с часом
 * прогона, и окна ниже считаются от него, а не написаны числами. Иначе проверка
 * проходила бы или падала в зависимости от часа суток.
 */
async function checklistOnStation(): Promise<{
  checklistId: string;
  stationId: string;
}> {
  const station = await createStation({ timezone: "UTC" });
  const checklistId = await createChecklist({ stationId: station.stationId });
  return { checklistId, stationId: station.stationId };
}

describe("публикация: состояние действия говорит об окне", () => {
  test("окно закрыто — состояние несёт предупреждение: час пиццерии, границы и когда откроется", async () => {
    const label = `closed-${String(Date.now()).slice(-6)}`;
    const { checklistId, stationId } = await checklistOnStation();
    const window = { start: utcTime(2), end: utcTime(3) };
    const form = publishForm(checklistId, window, label);
    // Станция уезжает тем же нажатием, каким идёт публикация: и окно, и станция
    // приходят в действие из ФОРМЫ, а не из базы.
    form.set("stationId", stationId);

    const state = await submitPublish(INITIAL_EDITOR_STATE, form);

    expect(state.status).toBe("published");
    expect(state.versionNumber).toBe(1);
    expect(
      state.closedWindow,
      "Версия опубликована в закрытое окно, а состояние об этом молчит — методист " +
        "узнает о промахе от сотрудника, через смену (T275).",
    ).toBeDefined();
    expect(state.closedWindow?.start).toBe(window.start);
    expect(state.closedWindow?.end).toBe(window.end);
    expect(state.closedWindow?.opensAt).toBe(window.start);
    expect(state.closedWindow?.tomorrow).toBe(false);
    // Записанное подменой не лежит без дела: действие обязано и спросить права, и
    // перечитать экран редактора — версия на нём появилась.
    expect(calls.admin).toBe(1);
    expect(calls.revalidated).toContain(`/admin/checklists/${checklistId}`);
    // Час назван настоящий — тот, что сейчас в пиццерии, с допуском на минуту,
    // перевалившую границу между запросом и проверкой.
    expect(
      Math.abs(
        minutesOf(state.closedWindow?.now ?? "") - minutesOf(utcTime(0)),
      ),
    ).toBeLessThanOrEqual(1);
  });

  test("окно идёт сейчас — обычное подтверждение, без предупреждения", async () => {
    const label = `open-${String(Date.now()).slice(-6)}`;
    const { checklistId, stationId } = await checklistOnStation();
    const form = publishForm(
      checklistId,
      { start: utcTime(-1), end: utcTime(1) },
      label,
    );
    form.set("stationId", stationId);

    const state = await submitPublish(INITIAL_EDITOR_STATE, form);

    expect(state.status).toBe("published");
    expect(state.versionNumber).toBe(1);
    expect(
      state.closedWindow,
      "Предупреждение показано при открытом окне — методист перестанет ему верить " +
        "ровно тогда, когда оно понадобится.",
    ).toBeUndefined();
  });

  test("окно у чек-листа без станции не сверяется: часов у него нет", async () => {
    const label = `nostation-${String(Date.now()).slice(-6)}`;
    const checklistId = await createChecklist({ stationId: null });
    const form = publishForm(
      checklistId,
      { start: utcTime(2), end: utcTime(3) },
      label,
    );

    const state = await submitPublish(INITIAL_EDITOR_STATE, form);

    // Публикация чек-листа без станции — отдельное поведение блока, и трогать его
    // задача не должна: версия создаётся, предупреждения об окне нет.
    expect(state.status).toBe("published");
    expect(state.closedWindow).toBeUndefined();
  });
});
