"use client";

import type { ReactElement } from "react";

import { DEFAULT_LOCALE } from "@/blocks/core/locale";
import { STATE_ACTION_CLASS, StateScreen } from "@/blocks/core/ui/StateScreen";

/**
 * Последний рубеж: сюда попадают только ошибки самой корневой разметки — то есть случай,
 * когда `src/app/error.tsx` рисовать уже не в чем. Next требует, чтобы этот экран отдавал
 * собственные `<html>` и `<body>`: обычная разметка до него не дожила.
 *
 * Вид тот же, что у обычной границы ошибки (T213, T214): полный экран, крупный заголовок,
 * окрашенная плашка отказа, акцентная кнопка во всю ширину. Экран, который человек видит
 * раз в жизни, не должен выглядеть как ещё один продукт.
 *
 * ЯЗЫК ЗДЕСЬ ОДИН — английский, язык продукта по умолчанию, и это осознанная плата.
 * Причины две, и обе проверяемые. Первая: язык страницы вычисляет как раз корневая
 * разметка (`getLocale()` в `layout.tsx`), а она в этом сценарии и упала — доверять её
 * ответу здесь нечему. Вторая: чтобы сказать то же самое по-русски, в клиентскую сборку
 * пришлось бы тянуть словарь целиком (28 КБ) на КАЖДУЮ страницу продукта, включая экран
 * заполнения на кухонном телефоне, — ради экрана, который человек, скорее всего, не
 * увидит ни разу. Сам факт ограничения записан в журнале блока, а не замолчан.
 */
export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}): ReactElement {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body className="bg-surface text-ink font-ui">
        <StateScreen
          testId="global-failure"
          tone="plain"
          title="The product did not start"
          notice="Even the page frame could not be built, so nothing can be shown here. The reason is written to the server log. Try again — if it keeps failing, pass the error code below to whoever runs the service."
          noticeTone="err"
          action={
            <button
              type="button"
              onClick={reset}
              className={STATE_ACTION_CLASS}
              data-testid="global-failure-retry"
            >
              Try again
            </button>
          }
          {...(error.digest === undefined
            ? {}
            : {
                note: (
                  <span data-testid="global-failure-digest">
                    Error code: {error.digest}
                  </span>
                ),
              })}
        />
      </body>
    </html>
  );
}
