// Общая заготовка обоих сценариев ленты: сама лента заполнений (`feed.spec.ts`) и
// карточка заполнения на телефоне (`submission-phone.spec.ts`) начинают с одной и той
// же станции — страна → пиццерия → «Кухня» с опубликованной первой версией
// чек-листа, — а расходятся дальше: лента добавляет вторую станцию и несколько
// заполнений сразу, карточка — одно, но самое широкое из возможных (T202/T203). До
// этого файла заготовка была скопирована в оба сценария и держалась одинаковой
// вручную — теперь она в одном месте.
import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";

/** Вход в кабинет управляющего паролем: оба сценария ленты начинают именно так. */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

/**
 * Телефон: боковое меню кабинета съедает 208 из 375 px, и всё, что не умеет сужаться
 * или прокручиваться внутри себя, тащит вбок всю страницу — вместе с меню и шапкой.
 */
export const PHONE = { width: 375, height: 800 } as const;

export interface SeededKitchen {
  readonly label: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly stationId: string;
  readonly checklistId: string;
  readonly versionId: string;
}

/**
 * Страна → пиццерия → станция «Кухня» с опубликованной первой версией чек-листа.
 * Данные кладутся прямо в базу, а не заводятся через экраны справочника и редактора:
 * оба сценария ленты проверяют ленту и карточку, а падение в чужом блоке искали бы
 * не там.
 *
 * `stationCode` передаёт вызывающий файл: код станции обязан быть уникален не только
 * в пределах одного файла, но и между файлами сценариев — они идут параллельно на
 * общей базе. `storeNameSuffix` по той же причине различает названия пиццерий двух
 * сценариев там, где иначе получились бы два одинаковых имени.
 */
export async function seedKitchenChecklist(
  pool: Pool,
  label: string,
  stationCode: string,
  sections: unknown,
  storeNameSuffix = "",
): Promise<SeededKitchen> {
  const country = await pool.query<{ id: string }>(
    "insert into countries (name, locale) values ($1, 'ru') returning id",
    [`Страна ${label}`],
  );
  const storeName = `Пиццерия ${label}${storeNameSuffix}`;
  const store = await pool.query<{ id: string }>(
    "insert into stores (country_id, name, timezone) values ($1, $2, 'UTC') returning id",
    [country.rows[0]?.id, storeName],
  );
  const storeId = store.rows[0]?.id;

  const station = await pool.query<{ id: string }>(
    "insert into stations (store_id, name, code) values ($1, $2, $3) returning id",
    [storeId, `Кухня ${label}`, stationCode],
  );
  const stationId = station.rows[0]?.id;

  const checklist = await pool.query<{ id: string }>(
    `insert into checklists (station_id, title, window_start, window_end)
     values ($1, $2, '00:00', '23:59') returning id`,
    [
      stationId,
      JSON.stringify({
        ru: `Открытие кухни ${label}`,
        en: `Kitchen opening ${label}`,
      }),
    ],
  );
  const checklistId = checklist.rows[0]?.id ?? "";

  const version = await pool.query<{ id: string }>(
    `insert into checklist_versions
       (checklist_id, version_number, status, station_id, sections, published_at)
     values ($1, 1, 'published', $2, $3, now()) returning id`,
    [checklistId, stationId, JSON.stringify(sections)],
  );
  const versionId = version.rows[0]?.id ?? "";

  return {
    label,
    storeId: storeId ?? "",
    storeName,
    stationId: stationId ?? "",
    checklistId,
    versionId,
  };
}
