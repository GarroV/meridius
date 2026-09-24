// Что именно запоминается, когда человек нажал кнопку языка.
//
// Сквозной сценарий (`e2e/locale-switch.spec.ts`) доказывает, что выбор доезжает до
// экрана. Он не видит двух вещей, а они и есть цена ошибки: под каким именем и на какой
// срок лёг выбор — имя куки общее с next-intl, и разойдясь с ним, продукт получил бы две
// правды о языке; и что чужая метка не записывается вовсе, потому что форму отправляет
// кто угодно чем угодно.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOCALE_COOKIE } from "../locale";

const cookieSet = vi.hoisted(() => vi.fn());
const revalidate = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ set: cookieSet }),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));

const { chooseLocale } = await import("./locale-action");

/** Год в секундах — столько живёт выбор языка. */
const YEAR_SECONDS = 31_536_000;

function form(value: string): FormData {
  const data = new FormData();
  data.set("locale", value);
  return data;
}

beforeEach(() => {
  cookieSet.mockClear();
  revalidate.mockClear();
});

describe("chooseLocale", () => {
  it("кладёт выбранный язык в куку под именем, которое читает продукт", async () => {
    // Arrange / Act
    await chooseLocale(form("ru"));

    // Assert
    expect(cookieSet).toHaveBeenCalledWith(
      LOCALE_COOKIE,
      "ru",
      expect.objectContaining({ path: "/", maxAge: YEAR_SECONDS }),
    );
  });

  it("просит перерисовать кабинет целиком, а не текущий экран", async () => {
    // Язык решается при отрисовке на сервере: без этого меню, из которого язык и
    // переключили, осталось бы на прежнем.
    await chooseLocale(form("en"));

    expect(revalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("язык, на котором продукт не говорит, не записывается вовсе", async () => {
    await chooseLocale(form("zz"));

    expect(cookieSet).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("поле без языка не роняет отправку и ничего не меняет", async () => {
    await chooseLocale(new FormData());

    expect(cookieSet).not.toHaveBeenCalled();
  });
});
