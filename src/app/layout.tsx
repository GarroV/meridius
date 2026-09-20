import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { asLocale, type Locale } from "@/blocks/core/locale";
import {
  resolvedTheme,
  THEME_ATTRIBUTE,
  THEME_BOOTSTRAP_SCRIPT,
  themeFromCookieHeader,
} from "@/blocks/core/theme";
import { HtmlLangSync } from "@/blocks/core/ui/HtmlLangSync";
import { FILL_DOCUMENT_LOCALE_HEADER } from "@/blocks/fill/locale";
import { nonceFromPolicy } from "@/security-headers";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

import { FONT_VARIABLES } from "./fonts";

import "./globals.css";

/**
 * Словари для клиентской стороны. Наверх отдаётся ТОЛЬКО раздел `failure`: граница ошибки
 * (`error.tsx`) обязана быть клиентской, а значит серверные `getTranslations` ей
 * недоступны. Весь словарь отдавать нельзя — это 28 КБ на каждую страницу, в том числе
 * на экран заполнения с кухонного телефона.
 */
const MESSAGES: Record<Locale, typeof en> = { en, ru };

export const metadata: Metadata = {
  title: "MERIDIUS",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Язык документа. Обычный маршрут берёт язык запроса, публичный экран заполнения —
  // тот, что назвал сам маршрут (`src/proxy.ts`): у него своё последнее звено цепочки
  // (русский), и два умолчания на один запрос давали документ, объявленный английским
  // поверх русского текста. Значение приходит заголовком, поэтому проверяется списком
  // языков продукта, а не принимается на веру.
  const requestHeaders = await headers();
  const declared = requestHeaders.get(FILL_DOCUMENT_LOCALE_HEADER);
  const locale =
    declared === null ? asLocale(await getLocale()) : asLocale(declared);

  // Тема (T236, D106). Явный выбор человека приезжает кукой и попадает в разметку
  // ЗДЕСЬ — то есть страница отдаётся уже тёмной, без мигания и без участия скриптов.
  // Выбора нет — атрибута нет, и тему называет системная настройка: её читает скрипт
  // ниже, потому что сервер о ней не знает.
  const theme = resolvedTheme(
    themeFromCookieHeader(requestHeaders.get("cookie")),
  );
  // Публичный маршрут заполнения идёт под строгой политикой с одноразовым ключом
  // (`src/proxy.ts`): без ключа браузер отбил бы скрипт молча, и кухонный телефон
  // остался бы светлым в ночную смену. На остальных маршрутах ключа нет и не нужно.
  const nonce = nonceFromPolicy(requestHeaders.get("content-security-policy"));

  return (
    <html
      lang={locale}
      className={FONT_VARIABLES}
      {...(theme === undefined ? {} : { [THEME_ATTRIBUTE]: theme })}
      // Скрипт ниже дописывает `data-theme` до гидратации — для React это
      // расхождение с тем, что он отрисовал, и без этой пометки он печатал бы
      // предупреждение на каждой странице продукта.
      suppressHydrationWarning
    >
      <body className="bg-canvas text-ink font-ui">
        {/*
          Первым в теле и синхронно: скрипт обязан выставить тему до того, как браузер
          нарисует первый кадр. Иначе кухонный телефон в три часа ночи мигает белым.
        */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
        <NextIntlClientProvider
          locale={locale}
          messages={{ failure: MESSAGES[locale].failure }}
        >
          {children}
        </NextIntlClientProvider>
        {/* Язык документа догоняет язык содержимого: страница заполнения может говорить
            на языке страны, а запрос — на другом (T179, см. сам компонент). */}
        <HtmlLangSync requestLocale={locale} />
      </body>
    </html>
  );
}
