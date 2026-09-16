// Отказы справочника в виде, который доходит до человека. Правила целостности живут
// в базе (`on delete restrict` на историю заполнений), и без такого перевода методист
// вместо «на пиццерию ссылаются заполнения» видел бы пятисотку и белый экран.

/**
 * Причина отказа. Код — он же ключ словаря (`catalog.errors.<код>`): один и тот же
 * набор значений в коде и в переводах. Полноту словаря держит не тип, а сторож
 * в `errors.test.ts`: ключ собирается строкой (`t(`errors.${code}`)`), и статический
 * сторож словаря такие ключи пропускает — забытый перевод вышел бы на экран сам собой.
 */
export const CATALOG_ERROR_CODES = [
  "nameRequired",
  "localeNotSupported",
  "unknownTimezone",
  "referencedByHistory",
  "referencedByChecks",
  "countryNotEmpty",
  "checklistArchived",
  "confirmationRequired",
  "notFound",
  "codeCollision",
] as const;

export type CatalogErrorCode = (typeof CATALOG_ERROR_CODES)[number];

const CODES = new Set<string>(CATALOG_ERROR_CODES);

/** Пришёл ли код отказа из этого набора. Нужен на границе: адрес правит кто угодно. */
export function isCatalogErrorCode(value: unknown): value is CatalogErrorCode {
  return typeof value === "string" && CODES.has(value);
}

/**
 * Отказ справочника. Сообщение — для журнала сервера и разработчика; на экран идёт
 * перевод по `code`, потому что текст исключения на кухне и в админке разный.
 */
export class CatalogError extends Error {
  readonly code: CatalogErrorCode;

  constructor(code: CatalogErrorCode, message: string) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
  }
}

/** Нарушение внешнего ключа: на строку ссылаются, поэтому база не даёт её удалить. */
export const PG_FOREIGN_KEY_VIOLATION = "23503";
/** Нарушение уникальности: например, код станции уже занят другой станцией. */
export const PG_UNIQUE_VIOLATION = "23505";

/**
 * Код ошибки PostgreSQL, если он есть. Drizzle заворачивает ошибку драйвера,
 * поэтому настоящий код может лежать в `cause` — ищем по цепочке.
 */
export function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  // У нашего собственного отказа поле `code` тоже есть, и принять его за код
  // PostgreSQL значило бы разбирать чужую ошибку вслепую.
  if (error instanceof CatalogError) return undefined;

  const code: unknown = (error as { code?: unknown }).code;
  if (typeof code === "string") return code;

  const cause: unknown = (error as { cause?: unknown }).cause;
  return cause === undefined ? undefined : pgErrorCode(cause);
}

/**
 * Имя ограничения, которое нарушено, если PostgreSQL его назвал. Лежит рядом с кодом
 * и так же прячется в `cause` под обёрткой Drizzle.
 */
export function pgConstraintName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (error instanceof CatalogError) return undefined;

  const constraint: unknown = (error as { constraint?: unknown }).constraint;
  if (typeof constraint === "string") return constraint;

  const cause: unknown = (error as { cause?: unknown }).cause;
  return cause === undefined ? undefined : pgConstraintName(cause);
}

/**
 * Что означает конкретный запрет удаления — по ИМЕНИ ограничения, а не по коду
 * PostgreSQL. Разница между строками этой таблицы и есть задача T154: до неё любой
 * конфликт внешнего ключа объявлялся историей заполнений, и пиццерия с заданным
 * режимом смены отказывалась удаляться с чужой причиной на экране.
 *
 * Здесь только те ограничения, отказ которых — правило продукта, а не дефект:
 * • история заполнений и отметки обходов неприкосновенны (принцип 3, D002);
 * • страна удаляется только пустой — это отдельный отказ, и он проверяется ещё до
 *   удаления; сюда он доходит лишь гонкой (пиццерию завели между проверкой и удалением).
 *
 * Чего здесь намеренно нет: `store_shift_modes_store_id_fkey` и
 * `stations_store_id_stores_id_fk`. Режим смены — настройка, он снимается вместе
 * с пиццерией (`deleteStore`), станции удаляются той же транзакцией. Их отказ означает,
 * что кто-то завёл строку прямо во время удаления, — это не правило, о котором надо
 * говорить методисту, а редкая гонка, и она обязана дойти до разработчика настоящей
 * ошибкой.
 */
const DELETION_CONFLICTS = new Map<
  string,
  { code: CatalogErrorCode; reason: string }
>([
  [
    "submissions_station_id_stations_id_fk",
    {
      code: "referencedByHistory",
      reason: "на станцию ссылаются заполнения, история неприкосновенна",
    },
  ],
  [
    "checks_station_id_fkey",
    {
      code: "referencedByChecks",
      reason: "на станцию ссылаются отметки обходов, история неприкосновенна",
    },
  ],
  [
    "stores_country_id_countries_id_fk",
    {
      code: "countryNotEmpty",
      reason: "в стране есть пиццерии, удалять можно только пустую страну",
    },
  ],
]);

/**
 * Переводит знакомый запрет удаления в понятный отказ. Незнакомый — пробрасывает как
 * есть: неизвестный конфликт, выданный за историю заполнений, отправляет человека
 * искать то, чего нет, и прячет от разработчика новое ограничение (T154). Проглоченная
 * неизвестная ошибка — молчаливый сбой, а не забота о пользователе.
 */
export function asDeletionConflict(error: unknown, what: string): never {
  if (pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION) {
    const conflict = DELETION_CONFLICTS.get(pgConstraintName(error) ?? "");
    if (conflict !== undefined) {
      throw new CatalogError(conflict.code, `${what}: ${conflict.reason}`);
    }
  }
  throw error;
}

/** Непустое имя после обрезки пробелов. Пустое имя делает строку справочника безымянной. */
export function requireName(name: string, what: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new CatalogError("nameRequired", `${what}: имя обязательно`);
  }
  return trimmed;
}
