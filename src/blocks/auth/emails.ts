/**
 * Почта учётки для входа через Google (D176). Ядро: ошибка здесь не падает, а тихо
 * пускает человека не в ту учётку — или в учётку, которую уже сняли.
 *
 * Правила:
 * - учётки по почте не заводятся: вход находит только учётку, к которой почту заранее
 *   привязала УК, неизвестная почта — отказ;
 * - почта хранится приведённой (без пробелов, в нижнем регистре) и сравнивается
 *   равенством: `Ivan@Dodobrands.io` и `ivan@dodobrands.io` — одна почта;
 * - одна почта — одна учётка на всю базу: иначе входу пришлось бы угадывать, куда пустить;
 * - снятая учётка по почте не находится, как и по логину.
 *
 * Кто вправе привязывать почту — не дело этого файла: экран «Партнёры» пускает только УК.
 */
import { and, eq, isNull } from "drizzle-orm";

import { accounts, getDb } from "@/blocks/data";

/** Предел длины адреса по RFC 5321; та же граница стоит ограничением в базе. */
const MAX_EMAIL_LENGTH = 254;
/** Нестрогая форма «что-то@что-то.что-то»: подтверждает почту Google, а не мы. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Код нарушения уникальности в Postgres. */
const UNIQUE_VIOLATION = "23505";

/** Почта, как её хранит база; null — не похожа на адрес. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL_SHAPE.test(email) ? email : null;
}

/** Действующая учётка с этой почтой. Снятая не находится. */
export async function findEmailAccount(
  rawEmail: string,
): Promise<{ readonly id: string } | null> {
  const email = normalizeEmail(rawEmail);
  if (email === null) return null;
  const [row] = await getDb()
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.email, email), isNull(accounts.disabledAt)));
  return row ?? null;
}

export type EmailBinding =
  | { readonly ok: true; readonly email: string | null }
  | {
      readonly ok: false;
      readonly reason: "email-shape" | "email-taken" | "not-found" | "removed";
    };

/** Нарушена ли уникальность — почты или логина. */
export function isUniqueViolation(error: unknown): boolean {
  // Drizzle заворачивает ошибку драйвера: код лежит либо на ней, либо в `cause`.
  const codeOf = (value: unknown): unknown =>
    typeof value === "object" && value !== null && "code" in value
      ? value.code
      : undefined;
  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? error.cause
      : undefined;
  return (
    codeOf(error) === UNIQUE_VIOLATION || codeOf(cause) === UNIQUE_VIOLATION
  );
}

/**
 * Привязать почту к учётке. Пустая строка — отвязать: учётка остаётся, входит паролем.
 *
 * Снятой учётке почта не привязывается: «сохранено» на снятой УК прочла бы как «теперь
 * войдёт». Условие стоит в самом запросе, чтобы снятие, успевшее между проверкой и
 * записью, не обходилось.
 */
export async function bindAccountEmail(
  accountId: string,
  rawEmail: string,
): Promise<EmailBinding> {
  const isUnbind = rawEmail.trim() === "";
  const email = isUnbind ? null : normalizeEmail(rawEmail);
  if (!isUnbind && email === null) return { ok: false, reason: "email-shape" };

  try {
    const updated = await getDb()
      .update(accounts)
      .set({ email })
      .where(and(eq(accounts.id, accountId), isNull(accounts.disabledAt)))
      .returning({ id: accounts.id });
    if (updated.length > 0) return { ok: true, email };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "email-taken" };
    throw error;
  }

  const [row] = await getDb()
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return { ok: false, reason: row === undefined ? "not-found" : "removed" };
}
