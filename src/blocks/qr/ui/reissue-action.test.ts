// Действие перевыпуска кода станции с листа печати — та самая развилка «спросить
// или сделать» (T266).
//
// Почему проверка живёт здесь, а не только в сквозном сценарии. Решение о том,
// спрашивать ли подтверждение, посчитано в `reissueOutcome` и там же проверено; но
// между решением и последствием стоит само действие, и ошибиться можно именно в нём:
// уйти в перевыпуск на неподтверждённом запросе, потерять проверку прав перед
// вопросом. Ни одного из этих промахов не видно в чтении кода, а сквозной сценарий
// ходит только через кнопку — ПРЯМУЮ ОТПРАВКУ ФОРМЫ он не проверяет, хотя в вебе она
// бесплатна: достаточно послать поля `storeId` и `stationId` мимо всякого окна.
//
// Та же проверка стоит у справочника (`catalog/ui/reissue-action.test.ts`): экранов
// два, и дыру надо закрыть на каждом.
import { afterEach, describe, expect, test, vi } from "vitest";

const calls = vi.hoisted(() => ({
  reissued: [] as string[],
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

vi.mock("@/blocks/catalog", () => ({
  CatalogError: class extends Error {},
  reissueStationCode: (stationId: string) => {
    calls.reissued.push(stationId);
    return Promise.resolve();
  },
}));

const { submitReissueCode } = await import("./actions");

const STORE = "22222222-2222-2222-2222-222222222222";
const STATION = "33333333-3333-3333-3333-333333333333";

/** Форма ровно такая, какую отправляет экран: без окна её и подделывают. */
function formFor(confirmed: boolean): FormData {
  const form = new FormData();
  form.append("storeId", STORE);
  form.append("stationId", STATION);
  if (confirmed) form.append("confirmed", "1");
  return form;
}

/** Адрес, на который действие увело экран: единственный его наблюдаемый выход. */
async function destinationOf(form: FormData): Promise<string> {
  try {
    await submitReissueCode(form);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("NEXT_REDIRECT ")) return message.slice(14);
    throw error;
  }
  throw new Error("действие завершилось, не уведя экран никуда");
}

afterEach(() => {
  calls.reissued.length = 0;
  calls.revalidated.length = 0;
  calls.admin = 0;
});

describe("перевыпуск кода станции с листа печати", () => {
  test("неподтверждённый запрос только спрашивает: код не трогается", async () => {
    const destination = await destinationOf(formFor(false));

    expect(
      calls.reissued,
      "Код станции сменился до подтверждения — напечатанные наклейки умерли бы " +
        "от прямой отправки формы, минуя окно с вопросом.",
    ).toEqual([]);
    expect(destination).toContain("confirm=reissue");
    expect(destination).toContain(STATION);
  });

  test("вопрос задаётся только тому, кто вошёл", async () => {
    await destinationOf(formFor(false));

    expect(
      calls.admin,
      "Права не проверены на пути «спросить»: экран вопроса с названием станции " +
        "рассказал бы постороннему, что такая станция есть.",
    ).toBe(1);
  });

  test("подтверждённый запрос меняет код и возвращает на лист печати", async () => {
    const destination = await destinationOf(formFor(true));

    expect(calls.reissued).toEqual([STATION]);
    // Лист уже открыт — после подтверждения он перерисовывается с новой наклейкой,
    // а не уводит человека куда-то ещё. Вопроса в адресе больше нет: иначе окно
    // открылось бы снова поверх только что перевыпущенного кода.
    expect(destination).toContain(STORE);
    expect(destination).not.toContain("confirm=");
    expect(calls.revalidated).toContain("/admin/qr");
  });
});
