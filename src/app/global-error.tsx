"use client";

import type { ReactElement } from "react";

import { DEFAULT_LOCALE } from "@/blocks/core/locale";
import {
  resolvedTheme,
  THEME_ATTRIBUTE,
  themeFromCookieHeader,
} from "@/blocks/core/theme";
import { STATE_ACTION_CLASS, StateScreen } from "@/blocks/core/ui/StateScreen";

import { FONT_VARIABLES } from "./fonts";

/**
 * Последний рубеж: сюда попадают только ошибки самой корневой разметки — то есть случай,
 * когда `src/app/error.tsx` рисовать уже не в чем. Next требует, чтобы этот экран отдавал
 * собственные `<html>` и `<body>`: обычная разметка до него не дожила.
 *
 * Вид тот же, что у обычной границы ошибки (T213, T214): полный экран, крупный заголовок,
 * окрашенная плашка отказа, акцентная кнопка во всю ширину. Экран, который человек видит
 * раз в жизни, не должен выглядеть как ещё один продукт.
 *
 * ПОЭТОМУ ЗДЕСЬ ПОВТОРЕНО ВСЁ, ЧТО ДАЁТ КОРНЕВАЯ РАЗМЕТКА, — фон, шрифты, тема. Не
 * повторено — значит не дано: разметки в этом сценарии нет. Так и разошлось (T264, сверка
 * экранов): тело красилось в `bg-surface`, то есть в белый, тогда как весь продукт стоит
 * на сером `bg-canvas` эталона (`--canvas` в `reference/tokens.css`, он же фон `body` в
 * `app.css`). На ширине больше 420 px у карточки пропадали серые поля по бокам, и
 * последний рубеж выглядел чужим ровно там, где обещал выглядеть своим. Вместе с фоном
 * не доставало и остального: без классов `next/font` переменная `--font-ui-loaded` не
 * объявлена и текст набирается системным шрифтом, а без атрибута темы тёмная настройка
 * телефона не доезжает.
 *
 * Тему здесь ставит не скрипт, как в корневой разметке, а сам компонент — и это не
 * вкусовщина. Проверено живьём: когда разметка падает, сервер отдаёт 500 без единой буквы
 * экрана (`curl` видит пустую страницу), а весь экран рисует React в браузере. Скрипт,
 * вставленный React в DOM, браузер не исполняет НИКОГДА — то есть `THEME_BOOTSTRAP_SCRIPT`
 * здесь был бы кодом, который выглядит работающим и не работает. Мигания это не добавляет:
 * до React на этом экране всё равно нет ни одного кадра.
 *
 * ЯЗЫК ЗДЕСЬ ОДИН — английский, язык продукта по умолчанию, и это осознанная плата.
 * Причины две, и обе проверяемые. Первая: язык страницы вычисляет как раз корневая
 * разметка (`getLocale()` в `layout.tsx`), а она в этом сценарии и упала — доверять её
 * ответу здесь нечему. Вторая: чтобы сказать то же самое по-русски, в клиентскую сборку
 * пришлось бы тянуть словарь целиком (28 КБ) на КАЖДУЮ страницу продукта, включая экран
 * заполнения на кухонном телефоне, — ради экрана, который человек, скорее всего, не
 * увидит ни разу. Сам факт ограничения записан в журнале блока, а не замолчан.
 */
/**
 * Тема последнего рубежа: выбор человека, а без выбора — настройка его устройства.
 *
 * Обе половины нужны. Куку читаем сами, потому что читать её было некому: это делала
 * корневая разметка на сервере, а она упала. Системную настройку спрашиваем у браузера,
 * потому что тёмные значения в `globals.css` включает только атрибут `data-theme`, и
 * медиазапросом их не достать (единственный экземпляр значений — осознанная плата, см.
 * журнал блока). Без этого экран отказа оставался светлым на тёмном телефоне: проверено
 * измерением, фон был `rgb(237, 239, 242)` там, где обычный экран давал `rgb(18, 22, 28)`.
 *
 * `document` проверяется не для красоты: компонент объявлен клиентским, но Next волен
 * попробовать отрисовать его и на сервере, и тогда обращение к `document` заменило бы
 * последний рубеж отказом внутри последнего рубежа.
 */
function lastResortTheme(): "light" | "dark" | undefined {
  if (typeof document === "undefined") return undefined;
  const chosen = resolvedTheme(themeFromCookieHeader(document.cookie));
  if (chosen !== undefined) return chosen;
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}): ReactElement {
  const theme = lastResortTheme();

  return (
    <html
      lang={DEFAULT_LOCALE}
      className={FONT_VARIABLES}
      {...(theme === undefined ? {} : { [THEME_ATTRIBUTE]: theme })}
    >
      <body className="bg-canvas text-ink font-ui">
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
