import type { Metadata } from "next";
import { Golos_Text, IBM_Plex_Mono } from "next/font/google";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import "./globals.css";

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
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${golosText.variable} ${plexMono.variable}`}
    >
      <body className="bg-canvas text-ink font-ui">{children}</body>
    </html>
  );
}
