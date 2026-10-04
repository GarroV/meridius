import type { MetadataRoute } from "next";

import icon192 from "@/blocks/core/brand/icon-192.png";
import icon512 from "@/blocks/core/brand/icon-512.png";
import iconMaskable from "@/blocks/core/brand/icon-maskable-512.png";

/**
 * Манифест: иконки знака «Глитч-мрамор» (D185) для домашнего экрана Android.
 *
 * Иконки — статическим импортом: Next сам приставляет базовый путь площадки (D045), а
 * файлы едут в `.next/static`, который standalone-образ копирует. Из `public/` они бы
 * на проде отвечали 404 — образ его не берёт. Сами PNG — копии раскатки из forma
 * (`dodo/brand/`), здесь не правятся.
 *
 * `start_url` и `display` не заданы сознательно: ярлык открывает ту страницу, с которой
 * его поставили, — кабинет у методиста, экран станции на кухонном телефоне, — и в
 * обычной вкладке браузера, как и сейчас.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MERIDIUS",
    short_name: "MERIDIUS",
    icons: [
      { src: icon192.src, sizes: "192x192", type: "image/png" },
      { src: icon512.src, sizes: "512x512", type: "image/png" },
      {
        src: iconMaskable.src,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
