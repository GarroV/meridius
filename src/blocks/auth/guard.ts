import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { redirectPath } from "@/blocks/core/base-path";

import { loadViewer } from "./accounts";
import { sessionSecret } from "./config";
import { LOGIN_PATH } from "./routes";
import type { Viewer } from "./scope";
import { SESSION_COOKIE_NAME, readSessionToken } from "./session";

/**
 * Кто вошёл. null — куки нет, подпись не сошлась, срок истёк или учётка снята.
 *
 * Обёрнуто в `cache`: разметка, страница и серверное действие одного запроса спрашивают
 * одно и то же, и ходить в базу за учёткой трижды незачем. Кэш живёт один запрос.
 */
const currentViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (token === undefined) return null;

  // Секрет читается только когда кука есть: без секрета проверить подпись нельзя,
  // и это отказ конфигурации — падаем, а не считаем куку годной.
  const session = readSessionToken(token, sessionSecret(), new Date());
  if (session === null) return null;

  return loadViewer(session.subject);
});

/**
 * Требует вход в кабинет и отдаёт, кто вошёл, — с его областью видимости (D145). Без
 * сессии уводит на форму входа, бросая исключение `redirect()`: управление в вызывающий
 * код не возвращается и данные не рендерятся.
 *
 * Вызывается разметкой `src/app/admin/layout.tsx` для всех экранов сразу и повторно —
 * экранами, серверными действиями и обработчиками, которым нужна область видимости.
 */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await currentViewer();
  if (viewer === null) redirect(redirectPath(LOGIN_PATH));
  return viewer;
}

/**
 * Требует учётку УК. Партнёру отвечает «такого адреса нет» — тем же, что и на любой
 * несуществующий адрес: сам факт, что у УК есть такой раздел, партнёру знать незачем.
 */
export async function requireHq(): Promise<Viewer> {
  const viewer = await requireAdmin();
  if (viewer.tenantKind !== "hq") notFound();
  return viewer;
}

/** Есть ли действующая сессия. Нужна форме входа, чтобы не показываться вошедшему. */
export async function hasAdminSession(): Promise<boolean> {
  return (await currentViewer()) !== null;
}
