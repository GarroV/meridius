// Иконки кабинета — набор линейки из дизайн-системы (`reference/icons.json`).
//
// Набор один на все продукты: эталон — Swarm Brain (D164). Файл кладёт раскатка forma
// рядом с ядром, здесь он не правится. Имя иконки — тип, выведенный из самого файла:
// опечатка в имени ловится проверкой типов, а не пустым местом на экране.
import type { ReactElement } from "react";

import ICONS from "../../../../docs/furca/design/reference/icons.json";

export type IconName = Exclude<keyof typeof ICONS, "_about">;

/** Контур 20×20 цветом текста — так рисует Swarm (RoyIcon). */
export function Icon({
  name,
  strokeWidth = 1.7,
  className,
}: {
  readonly name: IconName;
  readonly strokeWidth?: number;
  readonly className?: string;
}): ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
