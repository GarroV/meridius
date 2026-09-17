import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { Golos_Text, IBM_Plex_Mono } from "next/font/google";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { asLocale, type Locale } from "@/blocks/core/locale";
import { HtmlLangSync } from "@/blocks/core/ui/HtmlLangSync";
import { FILL_DOCUMENT_LOCALE_HEADER } from "@/blocks/fill/locale";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

import "./globals.css";

/**
 * Словари для клиентской стороны. Наверх отдаётся ТОЛЬКО раздел `failure`: граница ошибки
 * (`error.tsx`) обязана быть клиентской, а значит серверные `getTranslations` ей
 * недоступны. Весь словарь отдавать нельзя — это 28 КБ на каждую страницу, в том числе
 * на экран заполнения с кухонного телефона.
 */
const MESSAGES: Record<Locale, typeof en> = { en, ru };

/**
 * Шрифты эталона (`docs/furca/design/screens/*.html` грузят их из Google Fonts).
 * Здесь их подключает `next/font`: файлы скачиваются один раз на сборке и раздаются
 * с адреса самого приложения. На кухне это и есть разница между «экран открылся» и
 * «экран ждёт чужой домен» на слабой связи; заодно ни один запрос не уходит на сторону.
 *
 * Имя семейства `next/font` придумывает своё, поэтому оно попадает в CSS-переменную,
 * а не подменяет токен: список запасных шрифтов остаётся в `tokens.css` (D013).
 */
const golosText = Golos_Text({
  subsets: ["latin", "cyrillic"],
  // Токены просят 400/500/600/700 — переменное начертание отдаёт их одним файлом.
  weight: "variable",
  display: "swap",
  variable: "--font-ui-loaded",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  // Эталон грузит ровно эти два: моноширинным набраны время, коды станций и числа.
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-num-loaded",
});

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
  const declared = (await headers()).get(FILL_DOCUMENT_LOCALE_HEADER);
  const locale =
    declared === null ? asLocale(await getLocale()) : asLocale(declared);
  return (
    <html
      lang={locale}
      className={`${golosText.variable} ${plexMono.variable}`}
    >
      <body className="bg-canvas text-ink font-ui">
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
