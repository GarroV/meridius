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
import { fillLanguage } from "@/blocks/fill/document";
import { FILL_STATION_CODE_HEADER } from "@/blocks/fill/params";
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
  // Язык документа — то, что документ ОБЕЩАЕТ о своём содержимом. Обычный маршрут
  // объявляет язык запроса: его же показывает и экран кабинета. У публичного экрана
  // заполнения язык принадлежит пиццерии (D122), поэтому здесь берётся не заголовок с
  // готовым ответом, а то же самое решение, по которому экран выбирает слова
  // (`fill/document.ts`): одно вычисление на запрос, разойтись ему негде.
  //
  // Почему разметка спрашивает сама, а не ждёт страницу: она рендерится РАНЬШЕ страницы,
  // и дождаться её значило бы встать насмерть. Код станции ей называет посредник — из
  // адреса корневая разметка его не видит (T270).
  //
  // И это ЕДИНСТВЕННОЕ место, где решается язык документа. Рядом стоял запасной рубеж
  // `core/ui/HtmlLangSync`: он после гидратации переписывал `<html lang>` языком первого
  // объявленного куска содержимого. Снят (T272), потому что чинил не то и не тогда.
  // Не то — кусок содержимого вправе объявлять СВОЙ язык, не меняя язык документа: так
  // устроен печатный лист QR, остров языка пиццерии внутри кабинета методиста. Не тогда —
  // правка приезжала после гидратации, то есть мимо всех, ради кого атрибут существует:
  // мимо принтера, мимо диктора на первом кадре и мимо встроенного браузера сканера,
  // который до гидратации может не дойти вовсе. Цена была не в одном `useEffect`, а в
  // том, что отданный документ и живая вкладка отвечали по-разному, и зелёной
  // оказывалась та проверка, которая смотрела позже: так дефект T270 и дожил до приёмки.
  const requestHeaders = await headers();
  const stationCode = requestHeaders.get(FILL_STATION_CODE_HEADER);
  const locale =
    stationCode === null
      ? asLocale(await getLocale())
      : (await fillLanguage(stationCode)).locale;

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
      </body>
    </html>
  );
}
