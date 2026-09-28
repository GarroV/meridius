// Код ошибки PostgreSQL из того, что бросил слой данных.
//
// Отдельным файлом: код нужен и выпуску пина (занятое значение — не сбой, а повод взять
// другое), и разбору отказа для экрана (`issue-failure.ts`). Свой разбор, а не общий из
// `catalog/errors.ts`: границы блоков не дают `device` зависеть от `catalog`.

/**
 * Код ошибки, если он есть. Drizzle заворачивает ошибку драйвера, поэтому настоящий код
 * лежит в `cause`; у сетевого отказа подключения кодом служит `ECONNREFUSED` и подобные.
 */
export function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code: unknown = (error as { code?: unknown }).code;
  if (typeof code === "string") return code;
  const cause: unknown = (error as { cause?: unknown }).cause;
  return cause === undefined ? undefined : pgErrorCode(cause);
}
