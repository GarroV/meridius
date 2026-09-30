// Сессионная кука кабинета: ставится одинаково после входа паролем и через Google.
//
// Отдельно от `actions.ts` намеренно: тот файл помечен "use server", и всё, что он
// экспортирует, браузер может вызвать как серверное действие. Функция «выпусти сессию
// такому-то» среди них открыла бы кабинет кому угодно.
import { cookies } from "next/headers";

import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
} from "./session";

const COOKIE_PATH = "/";

/** Выпустить сессию учётке. Проверка, что её вправе выпускать, — на вызывающем. */
export async function setSessionCookie(
  subject: string,
  secret: string,
  issuedAt: Date,
): Promise<void> {
  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    createSessionToken(subject, secret, issuedAt),
    {
      // httpOnly: куку не достать из JavaScript, XSS не уносит сессию.
      httpOnly: true,
      // lax: кука едет и с возврата от Google (переход верхнего уровня), но не с
      // межсайтовых запросов из чужой страницы.
      sameSite: "lax",
      path: COOKIE_PATH,
      maxAge: SESSION_MAX_AGE_SECONDS,
      // На площадке — только по HTTPS. На localhost браузер считает соединение доверенным.
      secure: process.env.NODE_ENV === "production",
    },
  );
}

/** Завершить сессию: следующий запрос к `/admin/*` увидит форму входа. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete({ name: SESSION_COOKIE_NAME, path: COOKIE_PATH });
}
