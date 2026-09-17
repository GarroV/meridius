"use client";

import type { ReactElement } from "react";

import { DEFAULT_LOCALE } from "@/blocks/core/locale";
import {
  STATUS_ACTION_CLASS,
  StatusCard,
  StatusScreen,
} from "@/blocks/core/ui/StatusCard";

/**
 * Последний рубеж: сюда попадают только ошибки самой корневой разметки — то есть случай,
 * когда `src/app/error.tsx` рисовать уже не в чем. Next требует, чтобы этот экран отдавал
 * собственные `<html>` и `<body>`: обычная разметка до него не дожила.
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
      <body className="bg-canvas text-ink font-ui">
        <StatusScreen>
          <StatusCard
            testId="global-failure"
            title="The product did not start"
            text="Even the page frame could not be built, so nothing can be shown here. The reason is written to the server log. Try again — if it keeps failing, pass the error code below to whoever runs the service."
            action={
              <button
                type="button"
                onClick={reset}
                className={STATUS_ACTION_CLASS}
                data-testid="global-failure-retry"
              >
                Try again
              </button>
            }
            note={
              error.digest === undefined ? undefined : (
                <span data-testid="global-failure-digest">
                  Error code: {error.digest}
                </span>
              )
            }
          />
        </StatusScreen>
      </body>
    </html>
  );
}
