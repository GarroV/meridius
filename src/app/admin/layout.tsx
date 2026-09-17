import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { requireAdmin } from "@/blocks/auth/guard";
import { asLocale, type Locale } from "@/blocks/core/locale";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

/**
 * Охрана всей админки. Любой новый экран в `src/app/admin/**` попадает под неё сам,
 * без правок здесь и без памяти следующего разработчика.
 *
 * Чего разметка не закрывает: серверные действия и обработчики `route.ts` — они
 * выполняются мимо дерева разметки. Каждое такое место зовёт `requireAdmin()` само;
 * что ни один маршрут админки не забыт, проверяет `e2e/admin-guard.spec.ts`,
 * который перебирает файлы маршрутов, а не заранее записанный список.
 */
const MESSAGES: Record<Locale, typeof en> = { en, ru };

export default async function AdminLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  await requireAdmin();

  const locale = asLocale(await getLocale());

  /*
    Разделы словаря для клиентской стороны КАБИНЕТА — и только его: граница ошибки
    `admin/error.tsx` обязана быть клиентской (требование Next), а рисует она каркас
    кабинета, то есть меню с его подписями (`admin.nav`, `admin.sections`) и текст
    отказа (`failure`). Наверх, в корневую разметку, это отдавать нельзя: там словарь
    уходит и на экран заполнения с кухонного телефона, где кабинета нет и не будет.
  */
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={{
        failure: MESSAGES[locale].failure,
        admin: MESSAGES[locale].admin,
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
