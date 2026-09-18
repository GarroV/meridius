// Повторная отправка того же заполнения.
//
// Экран от двойного нажатия защищён — кнопка гаснет и отсоединяется, — но защита
// эта живёт в браузере, а тело запроса отправляет кто угодно. Больше того, повтор
// предлагает сам продукт: при обрыве связи на ответе ответы остаются на экране и
// кнопка становится «Отправить ещё раз» (критерий готовности 7). Если первый запрос
// дошёл, а ответ потерялся, второй обязан вернуть ту же квитанцию, а не завести
// в ленте управляющего вторую запись о той же работе.
//
// Опознаватель отправки — пара «версия + начало заполнения». Начало берётся из
// пропуска (`ticket.ts`), а время выдачи пропуска внутри процесса неповторимо,
// поэтому пара указывает ровно на одну отправку, и отдельной колонки под ключ
// повтора не нужно.
//
// Повтор ловится дважды, и ни один из двух не лишний. Поиск перед записью — быстрый
// путь: повтор после обрыва приходит, когда первая запись давно легла. Но запись,
// которая ещё не зафиксирована, поиск не видит, и два одновременных запроса оба
// слышали «не найдено» (T219). Эту гонку закрывает правило базы — уникальный индекс
// `submissions_one_per_filling_idx` (миграция 0012): вторая вставка ждёт первую и
// получает отказ, а отказ здесь превращается в квитанцию первой записи.
//
// Запрос свой, а не заказан в блоке `data`: так устроены границы проекта (D024).
import { and, eq } from "drizzle-orm";

import type { SaveSubmissionInput } from "@/blocks/data";
import { getDb, saveSubmission, submissions } from "@/blocks/data";

/** Правило базы «одно заполнение — одна запись» (миграция 0012). */
const ONE_PER_FILLING_INDEX = "submissions_one_per_filling_idx";
const PG_UNIQUE_VIOLATION = "23505";
/** Глубже Drizzle ошибку драйвера не заворачивает; предел — от петли в `cause`. */
const MAX_CAUSE_DEPTH = 5;

/** Заполнение, уже записанное по этому пропуску, — или `null`, если его нет. */
export async function findRepeatedSubmission(
  versionId: string,
  startedAt: number,
): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.versionId, versionId),
        eq(submissions.startedAt, new Date(startedAt)),
      ),
    )
    .limit(1);

  return row?.id ?? null;
}

/**
 * Записывает заполнение — или, если это же заполнение успело лечь по соседнему
 * запросу, возвращает ту, первую запись.
 *
 * Проигравший гонку получает не ошибку, а квитанцию: работа сотрудника принята,
 * и на экране у него то же «отправлено», что и у выигравшего. Страница ошибки
 * здесь была бы неправдой и вдобавок толкала бы нажать «отправить» ещё раз.
 */
export async function saveOnce(input: SaveSubmissionInput): Promise<string> {
  try {
    return await saveSubmission(input);
  } catch (error) {
    if (!isRepeatConflict(error)) throw error;
    const first = await findRepeatedSubmission(
      input.versionId,
      input.startedAt,
    );
    // Отказ по правилу есть, а первой записи нет — такого быть не может, и
    // выдумывать квитанцию нельзя: пусть падает с настоящей причиной.
    if (first === null) throw error;
    return first;
  }
}

function isRepeatConflict(error: unknown): boolean {
  const cause = driverError(error);
  return (
    cause?.code === PG_UNIQUE_VIOLATION &&
    cause.constraint === ONE_PER_FILLING_INDEX
  );
}

/**
 * Ошибка драйвера PostgreSQL внутри обёртки Drizzle: у неё есть строковый `code`,
 * а имя нарушенного правила лежит рядом. Оба поля читаются с одного уровня, чтобы
 * не склеить код одной ошибки с правилом другой.
 */
function driverError(
  error: unknown,
): { code: string; constraint: unknown } | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    const { code, constraint, cause } = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (typeof code === "string") return { code, constraint };
    current = cause;
  }
  return undefined;
}
