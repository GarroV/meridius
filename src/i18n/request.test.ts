// Какой словарь получит страница — и от кого зависит ответ.
//
// Ошибка здесь не падает: страница отрисуется целиком, просто на другом языке. Именно
// так и выглядел дефект T273 — лист QR для русской пиццерии приходил с английской
// подписью под кодом, потому что решение о языке принимал браузер методиста. Поэтому
// проверка стережёт не «функция вернула строку», а то, чей голос сильнее: явно
// названный язык поверхности или заголовок запроса.
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

// Заголовки запроса, которого в модульном тесте нет: подменяем хранилище Next своим.
const requestHeaders = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) => requestHeaders.get(name) ?? null,
    }),
}));

// `next-intl/server` вне Next разрешается в клиентскую сборку и отказывается работать
// («getRequestConfig is not supported in Client Components»), потому что условия
// `react-server` в модульном прогоне нет. Обёртка подменяется тем, чем она и является:
// по собственному объявлению next-intl `getRequestConfig` возвращает переданную функцию
// как есть. Проверяется здесь наша логика выбора словаря, а не эта обёртка; что вся
// связка доезжает до живой страницы, стережёт `e2e/qr-print-language.spec.ts`.
vi.mock("next-intl/server", () => ({
  getRequestConfig: <T>(create: T): T => create,
}));

const { default: requestConfig } = await import("./request");

/** Так next-intl зовёт конфигурацию: сегмента локали у продукта нет, только заголовок. */
function params(locale?: string) {
  return {
    locale,
    requestLocale: Promise.resolve(locale),
  };
}

beforeEach(() => {
  requestHeaders.clear();
});

describe("язык называют явно — он и решает", () => {
  /**
   * Тот самый случай T273: спрашивает поверхность, которая принадлежит пиццерии, а
   * открыта из браузера методиста. Без чтения параметра `locale` next-intl отдал бы
   * словарь по заголовку — и молча, никакой ошибки: `validateLocale` сверяет только
   * формат метки, а не то, что вернули запрошенный язык.
   */
  it("русский словарь при английском заголовке запроса", async () => {
    // Arrange: браузер методиста английский.
    requestHeaders.set("accept-language", "en-GB,en;q=0.9");

    // Act: язык поверхности назван явно.
    const config = await requestConfig(params("ru"));

    // Assert
    expect(config.locale).toBe("ru");
    expect(config.messages).toBe(ru);
  });

  it("и в обратную сторону: английский словарь при русском заголовке", async () => {
    requestHeaders.set("accept-language", "ru-RU,ru;q=0.9");

    const config = await requestConfig(params("en"));

    expect(config.locale).toBe("en");
    expect(config.messages).toBe(en);
  });
});

describe("языка не назвали — решает заголовок запроса", () => {
  it("русский заголовок даёт русский словарь", async () => {
    requestHeaders.set("accept-language", "ru-RU,ru;q=0.9");

    const config = await requestConfig(params());

    expect(config.locale).toBe("ru");
    expect(config.messages).toBe(ru);
  });

  it("язык, на котором продукт не говорит, даёт язык продукта", async () => {
    requestHeaders.set("accept-language", "kk-KZ,kk;q=0.9");

    const config = await requestConfig(params());

    expect(config.locale).toBe("en");
    expect(config.messages).toBe(en);
  });

  /**
   * Метка вне списка языков продукта не должна проскакивать в индексацию словаря:
   * `MESSAGES["kk"]` — это `undefined`, то есть страница без единой надписи, и тоже
   * без ошибки. Сюда такое значение прийти сегодня не может (язык называет наш код),
   * но проверка стоит именно потому, что отказ был бы молчаливым.
   */
  it("неизвестная метка не подменяет словарь пустотой", async () => {
    requestHeaders.set("accept-language", "en-GB,en;q=0.9");

    const config = await requestConfig(params("kk"));

    expect(config.locale).toBe("en");
    expect(config.messages).toBe(en);
  });
});
