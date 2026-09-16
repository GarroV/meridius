import Link from "next/link";
import type { ReactElement } from "react";

import type { FillChoiceView } from "../model";

/**
 * Станция, на которой в эту минуту открыто больше одного чек-листа: обход идёт
 * весь день поверх открытия и закрытия смены, и подставлять первый по началу окна
 * значило бы прятать остальные (#60).
 *
 * Выбор — ссылки, а не кнопки с обработчиком: экран открывают по QR на чужом
 * телефоне в подсобке, и переход обязан работать до того, как доедет клиентский код.
 * `Link`, а не голый `<a>`: базовый путь площадки Next приставляет только тому, что
 * идёт через его роутер, — голая ссылка увела бы на корень адреса, где живёт чужой
 * продукт (D046, сторож `core/admin-links.test.ts`). Разметку он отдаёт всё тем же
 * `<a>`, так что без клиентского кода переход работает. Стили — те же токены, что у
 * `StateScreen`: это одно семейство экранов «вместо чек-листа».
 */

export interface ChoiceScreenProps {
  readonly view: FillChoiceView;
  readonly title: string;
  readonly text: string;
  /** Адрес чек-листа по его идентификатору: маршрут знает вызывающая сторона. */
  readonly hrefFor: (checklistId: string) => string;
}

const ROOT_CLASS =
  "mx-auto flex min-h-screen w-full max-w-[420px] flex-col bg-surface px-[var(--space-8)] py-[var(--space-10)]";

const TITLE_CLASS =
  "text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold break-words";

const MUTED_CLASS = "text-[var(--ink-2)] break-words";

const LIST_CLASS = "mt-[var(--space-8)] flex flex-col gap-[var(--space-5)]";

// Строка списка — цель для пальца: не меньше 56px по высоте, весь прямоугольник
// кликабелен. Фокус виден (`focus-visible:outline`), потому что экран открывают и
// с клавиатуры — на планшете в доке.
const OPTION_CLASS =
  "flex min-h-[var(--tap-min)] w-full flex-col justify-center gap-[var(--space-2)] rounded-[var(--r-block)] border border-[var(--line-control)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-6)] text-left no-underline transition-colors hover:border-[var(--accent-line)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

const OPTION_TITLE_CLASS = "font-semibold break-words";

const OPTION_WINDOW_CLASS = `text-[length:var(--fs-dense)] ${MUTED_CLASS}`;

export function ChoiceScreen({
  view,
  title,
  text,
  hrefFor,
}: ChoiceScreenProps): ReactElement {
  return (
    <main data-testid="fill-choice" className={ROOT_CLASS}>
      <h1 className={TITLE_CLASS}>{title}</h1>
      <p className={`mt-[var(--space-4)] ${MUTED_CLASS}`}>{view.where}</p>
      <p className={`mt-[var(--space-5)] ${MUTED_CLASS}`}>{text}</p>
      <nav className={LIST_CLASS}>
        {view.options.map((option) => (
          <Link
            key={option.checklistId}
            href={hrefFor(option.checklistId)}
            data-testid="fill-choice-option"
            className={OPTION_CLASS}
          >
            <span className={OPTION_TITLE_CLASS}>{option.title}</span>
            <span className={OPTION_WINDOW_CLASS}>{option.window}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
