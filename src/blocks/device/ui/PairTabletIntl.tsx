import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

/**
 * Клиентский словарь кнопки выпуска кода: ровно раздел `device.issue`.
 *
 * Провайдер оборачивает ТОЛЬКО кнопку, а не экран: вложенный провайдер заменяет разделы
 * ближайшего, а не дополняет их (`core/ui/ThemeToggle.tsx`), и обёрнутое вместе с кнопкой
 * меню кабинета рисовало бы сырые ключи. Раздел передаётся явно, а не словарь целиком: в
 * браузер уезжают полтора десятка строк, а не весь продукт.
 */
export async function PairTabletIntl({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactElement> {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  const device = messages["device"] as Record<string, AbstractIntlMessages>;

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={{ device: { issue: device["issue"] ?? {} } }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
