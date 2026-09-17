import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import {
  STATUS_ACTION_CLASS,
  StatusCard,
  StatusScreen,
} from "@/blocks/core/ui/StatusCard";

/**
 * Адрес, которого в продукте нет, — публичная сторона (T177, T187).
 *
 * До этого экрана Next отдавал свою заглушку «404 This page could not be found.»:
 * по-английски независимо от языка телефона и без единого слова о продукте.
 *
 * Сюда же приходит человек с кухни, у которого ссылка станции оборвалась до `/s`
 * (T187): раньше такой адрес уводил его на пароль админки, которого у него нет и не
 * должно быть. Поэтому текст говорит с ним, а не с методистом: ссылка неполная —
 * отсканируйте наклейку заново.
 */
export default async function NotFoundPage(): Promise<ReactElement> {
  const t = await getTranslations("notFound");

  return (
    <StatusScreen>
      <StatusCard
        testId="not-found"
        title={t("title")}
        text={t("text")}
        action={
          <Link
            href="/"
            className={STATUS_ACTION_CLASS}
            data-testid="not-found-home"
          >
            {t("home")}
          </Link>
        }
      />
    </StatusScreen>
  );
}
