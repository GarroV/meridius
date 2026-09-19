"use client";

// Подтверждение перевыпуска кода станции (T260, эталон `design/screens/states.html`,
// блок «Опасное действие: перевыпуск кода»).
//
// Почему окно, а не карточка под деревом, как у подтверждения удаления. Перевыпуск
// запускается кнопкой в СТРОКЕ станции, то есть взгляд человека в этот момент на
// таблице, а не под ней. Карточка внизу экрана осталась бы незамеченной ровно в том
// сценарии, ради которого задача и заведена: промахнулся мимо кнопки — и ничего не
// понял. Окно перекрывает то место, куда человек смотрит.
//
// Идиома окна — та же, что у единственного другого диалога продукта
// (`editor/ui/ScheduleChip.tsx`): `role="dialog"` с `aria-modal`, имя из заголовка,
// Esc закрывает. Классы повторены, а не вынесены в общий модуль: границы модулей
// запрещают справочнику импортировать редактор, а общего места для оформления окон в
// продукте пока нет — их всего два. Появится третье — вынести в `core`.
//
// Состояние окна живёт В АДРЕСЕ (`?confirm=reissue`), а не в памяти компонента: это
// общее правило экрана (`ui/view.ts`) и единственный способ сохранить работу
// экрана без JavaScript — окно приходит с сервера уже открытым, «Отмена» обычная
// ссылка, а подтверждение — обычная форма. JavaScript добавляет к этому Esc и перевод
// фокуса внутрь окна, но ничего не держит.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";

import { submitReissueCode } from "./actions";

const FIELD_ID = "id";
const FIELD_COUNTRY_ID = "countryId";
const FIELD_STORE_ID = "storeId";
const FIELD_CONFIRMED = "confirmed";

const TITLE_ID = "reissue-dialog-title";

const BACKDROP_CLASS =
  "fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-[var(--space-6)]";
// Ширина эталона — 470 px, но не шире экрана: кабинет правят и с телефона (D092).
const DIALOG_CLASS =
  "bg-surface flex max-h-full w-[min(470px,100%)] flex-col overflow-hidden rounded-[var(--r-block)] shadow-[var(--sh-modal)] focus:outline-none";
const DIALOG_HEAD_CLASS =
  "flex items-center gap-[var(--space-4)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const DIALOG_TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const DIALOG_BODY_CLASS =
  "flex min-h-0 flex-col gap-[var(--space-6)] overflow-y-auto px-[var(--space-7)] py-[var(--space-6)]";
// Плашка предупреждения — `notice notice--warn` эталона: это не отказ (красный), а
// последствие, которое человек выбирает сам.
const NOTICE_WARN_CLASS =
  "flex gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--warn-line)] bg-[var(--warn-soft)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)] text-[var(--warn-ink)]";
const INLINE_CLASS = "flex flex-wrap items-center gap-[var(--space-5)]";
const BTN_PRIMARY_CLASS =
  "bg-accent inline-flex h-[var(--control-h)] cursor-pointer items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]";
const BTN_GHOST_CLASS =
  "inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";

/**
 * Тексты приходят уже переведёнными, а не берутся словарём здесь. Клиентскому словарю
 * нужен свой `NextIntlClientProvider` с разделом справочника — то есть словарь раздела
 * уехал бы в браузер ради четырёх строк. Та же идиома у кнопки перевыпуска соседнего
 * блока (`qr/ui/StationsCard.tsx`: `reissueLabel` приходит пропом).
 */
export interface ReissueDialogProps {
  readonly stationId: string;
  readonly countryId: string;
  readonly storeId: string;
  /** Заголовок с названием станции — он же имя окна для экранного диктора. */
  readonly title: string;
  /** Предупреждение о последствии: старая наклейка перестаёт работать сразу. */
  readonly warning: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  /** Куда возвращает «Отмена» и Esc: то же место дерева без подтверждения. */
  readonly cancelHref: string;
}

export function ReissueDialog({
  stationId,
  countryId,
  storeId,
  title,
  warning,
  confirmLabel,
  cancelLabel,
  cancelHref,
}: ReissueDialogProps): ReactElement {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Фокус уходит В ОКНО, а не остаётся на странице под ним: иначе человек с клавиатуры
  // и экранный диктор продолжают ходить по дереву, не зная, что их о чём-то спросили.
  // Наводится на само окно, а не на кнопку «Перевыпустить»: подтверждающая кнопка под
  // фокусом срабатывает пробелом или Enter — это второй промах вместо вопроса.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Esc — общий выход из модального окна. Ведёт туда же, куда «Отмена»: состояние окна
  // живёт в адресе, поэтому закрыть его значит сменить адрес, а не спрятать разметку.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") router.push(cancelHref);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [router, cancelHref]);

  return (
    <div className={BACKDROP_CLASS}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        data-testid="reissue-dialog"
        className={DIALOG_CLASS}
      >
        <div className={DIALOG_HEAD_CLASS}>
          <h2 id={TITLE_ID} className={DIALOG_TITLE_CLASS}>
            {title}
          </h2>
        </div>

        <div className={DIALOG_BODY_CLASS}>
          <p data-testid="reissue-warning" className={NOTICE_WARN_CLASS}>
            {warning}
          </p>
          <div className={INLINE_CLASS}>
            <form action={submitReissueCode}>
              <input type="hidden" name={FIELD_ID} value={stationId} />
              <input type="hidden" name={FIELD_COUNTRY_ID} value={countryId} />
              <input type="hidden" name={FIELD_STORE_ID} value={storeId} />
              <input type="hidden" name={FIELD_CONFIRMED} value="1" />
              <button
                type="submit"
                data-testid="reissue-confirm"
                className={BTN_PRIMARY_CLASS}
              >
                {confirmLabel}
              </button>
            </form>
            <Link
              href={cancelHref}
              data-testid="reissue-cancel"
              className={BTN_GHOST_CLASS}
            >
              {cancelLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
