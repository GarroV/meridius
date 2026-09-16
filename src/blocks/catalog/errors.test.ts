// Разбор отказов базы: какой именно запрет сработал и что об этом сказать человеку.
//
// Проверка нужна отдельно от запросов, потому что до T154 отказ разбирался ТОЛЬКО по коду
// PostgreSQL: любой конфликт внешнего ключа объявлялся историей заполнений. Пиццерия
// с заданным режимом смены не удалялась, а причина называлась чужая — методист шёл искать
// заполнения, которых нет. Конфликт различается по ИМЕНИ ограничения, и имя каждого
// сторожа названо здесь поимённо: новое ограничение на станцию или пиццерию обязано
// прийти сюда, а не молча притвориться историей.
import { describe, expect, test } from "vitest";

import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

import {
  CATALOG_ERROR_CODES,
  CatalogError,
  asDeletionConflict,
  pgConstraintName,
} from "./errors";

/** Ошибка драйвера в том виде, в каком её отдаёт `pg`: код, имя ограничения, таблица. */
function pgError(constraint: string, code = "23503"): Error {
  return Object.assign(new Error(`нарушено ограничение ${constraint}`), {
    code,
    constraint,
  });
}

/** Drizzle заворачивает ошибку драйвера: настоящая лежит в `cause`. */
function wrapped(error: Error): Error {
  return Object.assign(new Error("Failed query"), { cause: error });
}

describe("pgConstraintName", () => {
  test("находит имя ограничения и прямо в ошибке, и в завёрнутой", () => {
    expect(pgConstraintName(pgError("checks_station_id_fkey"))).toBe(
      "checks_station_id_fkey",
    );
    expect(pgConstraintName(wrapped(pgError("checks_station_id_fkey")))).toBe(
      "checks_station_id_fkey",
    );
  });

  test("ошибка без имени ограничения и не-ошибка дают undefined", () => {
    expect(pgConstraintName(new Error("просто сбой"))).toBeUndefined();
    expect(pgConstraintName(null)).toBeUndefined();
    expect(pgConstraintName("строка")).toBeUndefined();
  });

  test("собственный отказ справочника за ошибку базы не принимается", () => {
    // У `CatalogError` есть поле `code`, и разбирать его как ошибку драйвера значило бы
    // читать чужую ошибку вслепую — тот же запрет, что у `pgErrorCode`.
    expect(
      pgConstraintName(new CatalogError("notFound", "нет")),
    ).toBeUndefined();
  });
});

describe("asDeletionConflict", () => {
  test("ссылка из заполнений остаётся отказом по истории (D002)", () => {
    expect(() =>
      asDeletionConflict(
        wrapped(pgError("submissions_station_id_stations_id_fk")),
        "пиццерия",
      ),
    ).toThrow(
      expect.objectContaining({ code: "referencedByHistory" }) as Error,
    );
  });

  test("ссылка из отметок обхода — свой отказ, а не «заполнения»", () => {
    // Обход можно отметить, не завершив заполнение: сказать про заполнения здесь
    // значит отправить человека искать то, чего нет, — ровно дефект T154.
    expect(() =>
      asDeletionConflict(wrapped(pgError("checks_station_id_fkey")), "станция"),
    ).toThrow(expect.objectContaining({ code: "referencedByChecks" }) as Error);
  });

  test("страна с пиццерией — отказ «страна не пуста», а не история", () => {
    expect(() =>
      asDeletionConflict(
        wrapped(pgError("stores_country_id_countries_id_fk")),
        "страна",
      ),
    ).toThrow(expect.objectContaining({ code: "countryNotEmpty" }) as Error);
  });

  test("незнакомое ограничение пробрасывается как есть, а не выдаётся за историю", () => {
    // Главное правило T154. Режим смены — настройка, и она снимается вместе с пиццерией;
    // но если завтра на пиццерию сошлётся новая таблица, отказ обязан дойти до
    // разработчика настоящей ошибкой, а не превратиться в неправду на экране.
    const error = wrapped(pgError("store_shift_modes_store_id_fkey"));
    expect(() => asDeletionConflict(error, "пиццерия")).toThrow(error);
    try {
      asDeletionConflict(error, "пиццерия");
    } catch (thrown) {
      expect(thrown).not.toBeInstanceOf(CatalogError);
    }
  });

  test("ошибка не про внешний ключ пробрасывается как есть", () => {
    const error = wrapped(pgError("stations_code_unique", "23505"));
    expect(() => asDeletionConflict(error, "станция")).toThrow(error);
  });
});

describe("словарь отказов", () => {
  const dictionaries = { ru, en } as const;

  // Ключ отказа попадает в перевод собранной строкой (`t(`errors.${code}`)`), а собранные
  // ключи сторож словаря (core/messages-keys) пропускает намеренно. Значит, забытый
  // перевод не поймал бы никто: на экране встал бы сам ключ, и оба языка молчали бы.
  test.each(Object.entries(dictionaries))(
    "в словаре %s есть текст каждого кода отказа",
    (_locale, dictionary) => {
      const texts: Record<string, string> = dictionary.catalog.errors;
      for (const code of CATALOG_ERROR_CODES) {
        expect(texts[code], `нет перевода catalog.errors.${code}`).toBeTruthy();
      }
    },
  );

  test.each(Object.entries(dictionaries))(
    "в словаре %s нет текстов без кода",
    (_locale, dictionary) => {
      const codes = new Set<string>(CATALOG_ERROR_CODES);
      expect(
        Object.keys(dictionary.catalog.errors).filter((key) => !codes.has(key)),
      ).toEqual([]);
    },
  );
});
