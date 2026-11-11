"use client";

import { useEffect } from "react";

/**
 * Подключает `public/landing/landing.js` ПОСЛЕ гидратации.
 *
 * Скрипт правит готовую разметку (`style.top` у листов, полоса закладок в конце
 * `.lp`). Стоял он обычным `<script defer>`, а `defer` не ждёт React: скрипт успевал
 * до гидратации, и React, найдя чужие атрибуты и лишний узел, бросал ошибку #418 и
 * перерисовывал страницу заново — на каждой загрузке. Эффект выполняется только после
 * того, как дерево сошлось с разметкой сервера.
 */
export function LandingEnhance({ src }: { readonly src: string }): null {
  useEffect(() => {
    // Строгий режим разработки вызывает эффект дважды: второй скрипт удвоил бы полосу.
    if (document.querySelector(`script[data-landing-enhance]`) !== null) return;
    const script = document.createElement("script");
    script.src = src;
    script.dataset["landingEnhance"] = "";
    document.body.append(script);
  }, [src]);
  return null;
}
