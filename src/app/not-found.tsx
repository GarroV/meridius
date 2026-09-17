import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { STATE_ACTION_CLASS, StateScreen } from "@/blocks/core/ui/StateScreen";

/**
 * Адрес, которого в продукте нет, — публичная сторона (T177, T187, T213).
 *
 * До этого экрана Next отдавал свою заглушку «404 This page could not be found.»:
 * по-английски независимо от языка телефона и без единого слова о продукте.
 *
 * Сюда же приходит человек с кухни, у которого ссылка станции оборвалась до `/s`
 * (T187): раньше такой адрес уводил его на пароль админки, которого у него нет и не
 * должно быть. Поэтому текст говорит с ним, а не с методистом: ссылка неполная —
 * отсканируйте наклейку заново.
 *
 * Экран полноэкранный (`StateScreen`), а не карточка кабинета: адрес без наклейки
 * открывают с телефона, и там у состояния тот же вид, что у «код больше не
 * действует» — белый фон от края, крупный заголовок, одна акцентная кнопка во всю
 * ширину. До T213 здесь стояла админская `StatusCard` — рамка и тень на сером
 * канвасе с некрашеной кнопкой.
 */
export default async function NotFoundPage(): Promise<ReactElement> {
  const t = await getTranslations("notFound");

  return (
    <StateScreen
      testId="not-found"
      tone="plain"
      title={t("title")}
      text={t("text")}
      action={
        <Link
          href="/"
          className={STATE_ACTION_CLASS}
          data-testid="not-found-home"
        >
          {t("home")}
        </Link>
      }
    />
  );
}
