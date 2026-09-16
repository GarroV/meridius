// Отказ сида, сказанный человеку словами.
//
// До T173 любая помеха выходила наружу голой трассой `DrizzleQueryError`: запрос,
// параметры и `ri_triggers.c` — то есть ничего для того, кто просто запустил
// `./scripts/up` перед показом. Здесь два вида отказа разведены: наш собственный,
// который уже знает и помеху, и что с ней делать, и всё остальное — чужая ошибка,
// которую честнее показать в рамке, чем пересказывать своими словами.

/** Отказ, который сид сформулировал сам: сообщение годится для печати как есть. */
export class DemoSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoSeedError";
  }
}

interface PostgresDetails {
  readonly message: string;
  readonly detail?: string;
  readonly constraint?: string;
}

function textField(source: object, field: string): string | undefined {
  const value: unknown = (source as Record<string, unknown>)[field];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Подробности от PostgreSQL, если они есть. Drizzle заворачивает ошибку драйвера,
 * поэтому настоящая лежит в `cause` — ищем по цепочке, как это делает `pgErrorCode`
 * в справочнике.
 */
function postgresDetails(error: unknown): PostgresDetails | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (error instanceof DemoSeedError) return undefined;

  const code = textField(error, "code");
  // Пятизначный код SQLSTATE — единственный признак, по которому ошибку драйвера
  // можно отличить от любой другой: поле `code` есть и у ошибок Node.
  if (code !== undefined && /^[\dA-Z]{5}$/.test(code)) {
    return {
      message: textField(error, "message") ?? code,
      detail: textField(error, "detail"),
      constraint: textField(error, "constraint"),
    };
  }

  return postgresDetails((error as { cause?: unknown }).cause);
}

/**
 * Что печатать, когда сид не прошёл. Своему отказу верим на слово, чужой показываем
 * рамкой с подробностями базы и следом вызова: расхождение схемы с описанием контура
 * чинится не по тексту сообщения, а по тому, где именно оно возникло.
 */
export function describeSeedFailure(error: unknown): string {
  if (error instanceof DemoSeedError) return error.message;

  const lines = ["Демонстрационный контур не заведён."];
  const details = postgresDetails(error);

  if (details === undefined) {
    lines.push(
      error instanceof Error ? error.message : String(error),
      "",
      "Это не тот отказ, который сид умеет разобрать.",
    );
  } else {
    lines.push(
      `База отказала: ${details.message}`,
      ...(details.detail === undefined ? [] : [`  ${details.detail}`]),
      ...(details.constraint === undefined
        ? []
        : [`  нарушено правило ${details.constraint}`]),
      "",
      "Это не тот отказ, который сид умеет разобрать. Проверьте, что база поднята",
      "и миграции накатаны (npm run db:migrate).",
    );
  }

  const stack = error instanceof Error ? error.stack : undefined;
  if (stack !== undefined) lines.push("", stack);

  return lines.join("\n");
}
