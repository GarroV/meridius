// Справочник стран: список с числом пиццерий, создание, правка, удаление.
// Удаление разрешено только для пустой страны (принцип 3 распространяется и на
// справочник: снести страну вместе с её пиццериями одним махом нельзя).
import { asc, count, eq } from "drizzle-orm";

import { isLocale, LOCALES, type Locale } from "@/blocks/core/locale";
import { countries, getDb, stores } from "@/blocks/data";

import { CatalogError, asDeletionConflict, requireName } from "./errors";

// Формат id проверяется до похода в базу: иначе некорректная строка доходит до
// драйвера и падает кодом 22P02 (см. такую же проверку в submissions.ts), а по
// контракту функции обязаны вернуть CatalogError("notFound"), а не исключение драйвера.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Что значит имя в сообщениях requireName/asDeletionConflict — вынесено в константу,
// чтобы литерал не повторялся в трёх местах файла (sonarjs/no-duplicate-string).
const WHAT_COUNTRY = "страна";

export interface CountryRow {
  id: string;
  name: string;
  locale: Locale;
  storeCount: number;
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function countryNotFound(id: string): CatalogError {
  return new CatalogError("notFound", `Страна не найдена: ${id}`);
}

/**
 * Язык страны допускает только языки продукта (D009) — это же и ограничение базы
 * `countries_locale`.
 *
 * Список спрашивается у core, а не пишется здесь заново: своя пара `value === "ru" ||
 * value === "en"` стояла ровно до T268 и была из тех копий, о которых компилятор молчит.
 * Третий язык в `LOCALES` доезжает сюда сам — и в отказ тоже, поэтому он перечисляет
 * языки, а не называет два.
 */
function requireLocale(locale: string): Locale {
  if (!isLocale(locale)) {
    throw new CatalogError(
      "localeNotSupported",
      `Язык «${locale}» не поддержан продуктом: допустимы только ${LOCALES.join(", ")}`,
    );
  }
  return locale;
}

/**
 * Список стран для справочника, отсортированный по имени. `storeCount` считается
 * одним запросом с группировкой (левое соединение со `stores`), а не запросом
 * на страну — иначе список из сотни стран стоил бы сотню лишних обращений к базе.
 */
export async function listCountries(): Promise<CountryRow[]> {
  const rows = await getDb()
    .select({
      id: countries.id,
      name: countries.name,
      locale: countries.locale,
      storeCount: count(stores.id),
    })
    .from(countries)
    .leftJoin(stores, eq(stores.countryId, countries.id))
    .groupBy(countries.id)
    .orderBy(asc(countries.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    // Безопасно: значение уже прошло через requireLocale при записи, и ограничение
    // базы countries_locale не пускает в столбец ничего, кроме языков продукта.
    locale: row.locale as Locale,
    storeCount: row.storeCount,
  }));
}

export async function createCountry(input: {
  name: string;
  locale: string;
}): Promise<string> {
  const name = requireName(input.name, WHAT_COUNTRY);
  const locale = requireLocale(input.locale);

  const [row] = await getDb()
    .insert(countries)
    .values({ name, locale })
    .returning({ id: countries.id });
  if (row === undefined) throw new Error("Страна не сохранилась");
  return row.id;
}

export async function updateCountry(
  id: string,
  input: { name: string; locale: string },
): Promise<void> {
  if (!isUuid(id)) throw countryNotFound(id);
  const name = requireName(input.name, WHAT_COUNTRY);
  const locale = requireLocale(input.locale);

  const rows = await getDb()
    .update(countries)
    .set({ name, locale })
    .where(eq(countries.id, id))
    .returning({ id: countries.id });
  if (rows.length === 0) throw countryNotFound(id);
}

/**
 * Удаляет страну. Разрешено только для пустой страны: проверка идёт до удаления
 * и отдельным запросом, а не полагается на отказ внешнего ключа — иначе пришлось бы
 * различать по коду ошибки «в стране есть пиццерии» и «на пиццерию ссылается история»,
 * а это разные отказы для методиста (countryNotEmpty против referencedByHistory).
 */
export async function deleteCountry(id: string): Promise<void> {
  if (!isUuid(id)) throw countryNotFound(id);

  const storeCountRows = await getDb()
    .select({ storeCount: count(stores.id) })
    .from(stores)
    .where(eq(stores.countryId, id));
  const storeCount = storeCountRows[0]?.storeCount ?? 0;
  if (storeCount > 0) {
    throw new CatalogError(
      "countryNotEmpty",
      `Страна ${id}: в ней есть пиццерии, удалять можно только пустую страну`,
    );
  }

  let deletedRows: { id: string }[];
  try {
    deletedRows = await getDb()
      .delete(countries)
      .where(eq(countries.id, id))
      .returning({ id: countries.id });
  } catch (error) {
    asDeletionConflict(error, WHAT_COUNTRY);
  }
  if (deletedRows.length === 0) throw countryNotFound(id);
}
