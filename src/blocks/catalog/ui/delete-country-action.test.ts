// Действие удаления страны — развилка «спросить или удалить» (T267).
//
// Почему проверка живёт здесь. Подтверждение удаления страны держит ЭКРАН, а не
// слой: слой отказывает только непустой стране, а пустую сносит молча. Значит всё,
// что стоит между нажатием и исчезновением строки, — это одна проверка в действии,
// и ошибиться можно ровно в ней. Сквозной сценарий ходит через кнопку и прямую
// отправку формы не проверяет, а в вебе она бесплатна.
import { afterEach, describe, expect, test, vi } from "vitest";

const calls = vi.hoisted(() => ({
  deleted: [] as string[],
  admin: 0,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {
    // Ничего: этот тест смотрит на то, куда действие увело экран.
  },
}));

vi.mock("@/blocks/auth/guard", () => ({
  requireAdmin: () => {
    calls.admin += 1;
    return Promise.resolve();
  },
}));

vi.mock("../countries", () => ({
  createCountry: () => Promise.resolve(),
  updateCountry: () => Promise.resolve(),
  deleteCountry: (countryId: string) => {
    calls.deleted.push(countryId);
    return Promise.resolve();
  },
}));

const { submitDeleteCountry } = await import("./actions");

const COUNTRY = "11111111-1111-1111-1111-111111111111";

function formFor(confirmed: boolean): FormData {
  const form = new FormData();
  form.append("id", COUNTRY);
  if (confirmed) form.append("confirmed", "1");
  return form;
}

/** Адрес, на который действие увело экран: единственный его наблюдаемый выход. */
async function destinationOf(form: FormData): Promise<string> {
  try {
    await submitDeleteCountry(form);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("NEXT_REDIRECT ")) return message.slice(14);
    throw error;
  }
  throw new Error("действие завершилось, не уведя экран никуда");
}

afterEach(() => {
  calls.deleted.length = 0;
  calls.admin = 0;
});

describe("удаление страны", () => {
  test("неподтверждённый запрос только спрашивает: страна на месте", async () => {
    const destination = await destinationOf(formFor(false));

    expect(
      calls.deleted,
      "Страна удалена до подтверждения. Каскадом ничего не умирает, но правило " +
        "экрана «удаление всегда спрашивает» перестаёт быть правилом.",
    ).toEqual([]);
    expect(destination).toContain("confirm=country");
    expect(destination).toContain(COUNTRY);
  });

  test("вопрос задаётся только тому, кто вошёл", async () => {
    await destinationOf(formFor(false));

    expect(
      calls.admin,
      "Права не проверены на пути «спросить»: карточка вопроса с названием " +
        "страны рассказала бы постороннему, что такая страна есть.",
    ).toBe(1);
  });

  test("подтверждённый запрос удаляет и возвращает в пустой справочник", async () => {
    const destination = await destinationOf(formFor(true));

    expect(calls.deleted).toEqual([COUNTRY]);
    // Выбранной страны больше нет, поэтому и в адресе её быть не должно: иначе
    // экран открылся бы на удалённой строке и показал отказ вместо справочника.
    expect(destination).not.toContain(COUNTRY);
  });
});
