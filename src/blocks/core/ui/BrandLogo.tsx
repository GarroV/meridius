import type { StaticImageData } from "next/image";
import type { ReactElement } from "react";

import brandMarkFile from "../brand/mark-small.svg";

// Next объявляет `*.svg` как `any` (на случай SVGR); у нас это обычный статический файл.
const brandMark = brandMarkFile as StaticImageData;

/**
 * Знак продукта — «Глитч-мрамор», малый уровень (D185). Один и тот же в панели и в
 * полосе. Файл — копия раскатки из forma (`dodo/brand/`), здесь не правится.
 *
 * Картинкой, а не встроенным SVG: знак держит свои `id` (литера, полосы обрезки), и две
 * встроенные копии на странице — панель и полоса — делили бы одни и те же `id`. Адрес
 * даёт статический импорт: Next сам приставляет базовый путь площадки (D045), а файл
 * едет в `.next/static`, который образ копирует, — в отличие от `public/`.
 * `alt` пустой: имя марки рядом произносит ссылка.
 */
export function BrandLogo({
  className,
}: {
  readonly className: string;
}): ReactElement {
  return (
    <img
      className={className}
      src={brandMark.src}
      width={brandMark.width}
      height={brandMark.height}
      alt=""
      data-testid="brand-mark"
    />
  );
}
