import { describe, expect, it } from "vitest";

import {
  asThemeChoice,
  resolvedTheme,
  THEME_ATTRIBUTE,
  THEME_BOOTSTRAP_SCRIPT,
  THEME_CHOICES,
  THEME_COOKIE_NAME,
  themeCookie,
  themeFromCookieHeader,
  type ThemeChoice,
} from "./theme";

describe("asThemeChoice", () => {
  it("принимает три выбора продукта", () => {
    expect(THEME_CHOICES.map((choice) => asThemeChoice(choice))).toEqual([
      "system",
      "light",
      "dark",
    ]);
  });

  it("выбора нет — работает автоматика", () => {
    expect(asThemeChoice(undefined)).toBe("system");
    expect(asThemeChoice(null)).toBe("system");
    expect(asThemeChoice("")).toBe("system");
  });

  // Значение приходит из куки, то есть снаружи и без всякой гарантии. Молча принять
  // чужое слово значило бы поставить его атрибутом на <html> — это ровно тот вход,
  // которому нельзя верить.
  it("чужое значение к автоматике и сводится", () => {
    expect(asThemeChoice("DARK")).toBe("system");
    expect(asThemeChoice("dark; Path=/")).toBe("system");
    expect(asThemeChoice('"><script>')).toBe("system");
  });
});

describe("resolvedTheme", () => {
  it("явный выбор становится значением атрибута", () => {
    expect(resolvedTheme("light")).toBe("light");
    expect(resolvedTheme("dark")).toBe("dark");
  });

  // «Автоматически» значит «сервер не решает»: атрибута нет, и тему выбирает
  // системная настройка уже в браузере.
  it("автоматика атрибута не ставит", () => {
    expect(resolvedTheme("system")).toBeUndefined();
  });
});

describe("themeFromCookieHeader", () => {
  it("читает свой выбор из заголовка с несколькими куками", () => {
    expect(
      themeFromCookieHeader(`a=1; ${THEME_COOKIE_NAME}=dark; b=2`),
    ).toBe<ThemeChoice>("dark");
  });

  it("куки нет — автоматика", () => {
    expect(themeFromCookieHeader("a=1; b=2")).toBe("system");
    expect(themeFromCookieHeader("")).toBe("system");
    expect(themeFromCookieHeader(null)).toBe("system");
  });

  // Имя куки продукта — не подстрока чужого имени: `other_meridius_theme=dark`
  // не должен выдаваться за свой выбор.
  it("чужая кука с похожим именем не считается своей", () => {
    expect(themeFromCookieHeader(`other_${THEME_COOKIE_NAME}=dark`)).toBe(
      "system",
    );
  });
});

describe("themeCookie", () => {
  it("явный выбор сохраняется надолго и на весь продукт", () => {
    const cookie = themeCookie("dark");
    expect(cookie).toContain(`${THEME_COOKIE_NAME}=dark`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toMatch(/Max-Age=\d{6,}/);
  });

  // Возврат к автоматике — это стирание выбора, а не ещё одно сохранённое значение:
  // иначе «Авто» пришлось бы понимать в двух местах по-разному.
  it("возврат к автоматике стирает куку", () => {
    expect(themeCookie("system")).toContain("Max-Age=0");
    expect(themeCookie("system")).toContain(`${THEME_COOKIE_NAME}=`);
    expect(themeCookie("system")).not.toContain("=system");
  });
});

/**
 * Скрипт довключения темы исполняется, а не читается глазами: он попадает в разметку
 * строкой, и опечатка в нём тиха — страница просто остаётся светлой. Подделки
 * подставляются параметрами функции, поэтому скрипт обязан звать `matchMedia` и
 * `document` без `window.` — так же, как их видит браузер.
 */
function runBootstrap(options: {
  readonly attribute?: string | undefined;
  readonly systemDark: boolean;
  readonly mediaThrows?: boolean;
}): string | undefined {
  let attribute = options.attribute;
  const documentStub = {
    documentElement: {
      hasAttribute: (name: string): boolean =>
        name === THEME_ATTRIBUTE && attribute !== undefined,
      setAttribute: (name: string, value: string): void => {
        if (name === THEME_ATTRIBUTE) attribute = value;
      },
    },
  };
  const matchMedia = (query: string): { matches: boolean } => {
    if (options.mediaThrows === true) throw new Error("нет matchMedia");
    return { matches: options.systemDark && query.includes("dark") };
  };

  // Ровно то, что делает браузер с этой строкой; проверять её иначе значит
  // проверять не её, а свой пересказ.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function(
    "document",
    "matchMedia",
    THEME_BOOTSTRAP_SCRIPT,
  ) as (documentStub: unknown, matchMediaStub: unknown) => void;
  run(documentStub, matchMedia);
  return attribute;
}

describe("скрипт довключения темы", () => {
  it("системная тёмная включается сама, пока выбора нет", () => {
    expect(runBootstrap({ systemDark: true })).toBe("dark");
  });

  it("системная светлая ничего не ставит", () => {
    expect(runBootstrap({ systemDark: false })).toBeUndefined();
  });

  // Это и есть «переключатель перебивает автоматику» (D106): выбор проставлен
  // сервером из куки, и системная настройка его не трогает.
  it("явный светлый выбор переживает системную тёмную", () => {
    expect(runBootstrap({ attribute: "light", systemDark: true })).toBe(
      "light",
    );
  });

  it("явный тёмный выбор переживает системную светлую", () => {
    expect(runBootstrap({ attribute: "dark", systemDark: false })).toBe("dark");
  });

  // Скрипт стоит первым в теле страницы: его исключение остановило бы разбор
  // разметки целиком, то есть страница не открылась бы вовсе.
  it("отказ matchMedia не роняет страницу", () => {
    expect(() =>
      runBootstrap({ systemDark: true, mediaThrows: true }),
    ).not.toThrow();
  });
});
