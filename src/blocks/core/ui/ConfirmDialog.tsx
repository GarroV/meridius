"use client";

// Окно подтверждения опасного действия — одно на продукт (T260, T266, T267).
//
// Почему в `core`, а не по копии в каждом блоке. Здесь это уже было сказано вслух:
// `catalog/ui/ReissueDialog.tsx` повторял классы окна редактора с припиской
// «появится третье окно — вынести в core». Третье появилось (тот же перевыпуск с
// листа печати, T266), поэтому копия и переехала сюда, а не размножилась. Цена
// копии не в буквах: разойдутся не классы, а ПОВЕДЕНИЕ — в одном окне Esc закроет,
// в другом нет, и человек узнает об этом на необратимом действии.
//
// Идиома окна взята у эталона (`docs/furca/design/reference/components.css`,
// `.dialog`): шапка с заголовком, тело с предупреждением, подвал с действиями.
// `role="dialog"` с `aria-modal`, имя окна — его заголовок, Esc закрывает.
//
// Состояние окна живёт В АДРЕСЕ (`?confirm=…`), а не в памяти компонента: это общее
// правило экранов продукта и единственный способ сохранить работу без JavaScript —
// окно приходит с сервера уже открытым, «Отмена» обычная ссылка, а подтверждение —
// обычная форма. JavaScript добавляет к этому Esc и перевод фокуса внутрь окна, но
// ничего не держит.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";

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
// Подвал окна — `.dialog__foot` эталона, тот же, что у окна регулярности редактора:
// действия стоят В ПОДВАЛЕ, а не в теле, и подтверждающее — последним (T267).
const DIALOG_FOOT_CLASS =
  "flex flex-wrap items-center justify-end gap-[var(--space-4)] border-t border-[var(--line)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-5)]";
// Плашка предупреждения — `notice notice--warn` эталона: это не отказ (красный), а
// последствие, которое человек выбирает сам.
const NOTICE_WARN_CLASS =
  "flex gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--warn-line)] bg-[var(--warn-soft)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)] text-[var(--warn-ink)]";
const BTN_PRIMARY_CLASS =
  "bg-accent inline-flex h-[var(--control-h)] cursor-pointer items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]";
const BTN_GHOST_CLASS =
  "inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";

/**
 * Тексты приходят уже переведёнными, а не берутся словарём здесь. Клиентскому словарю
 * нужен свой `NextIntlClientProvider` с разделом экрана — то есть словарь раздела
 * уехал бы в браузер ради четырёх строк. Та же идиома у кнопки перевыпуска
 * (`qr/ui/StationsCard.tsx`: `reissueLabel` приходит пропом).
 */
export interface ConfirmDialogProps {
  /**
   * Имя действия в разметке: из него собраны `data-testid` окна и его кнопок
   * (`<name>-dialog`, `<name>-confirm`, `<name>-cancel`). Сквозные сценарии ищут
   * окно по ним, а не по тексту: текст переводится, признак действия — нет.
   */
  readonly name: string;
  /** Заголовок с названием того, о чём спрашивают, — он же имя окна для диктора. */
  readonly title: string;
  /** Предупреждение о последствии: что именно станет необратимым. */
  readonly warning: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  /** Куда возвращает «Отмена» и Esc: то же место экрана без подтверждения. */
  readonly cancelHref: string;
  /** Серверное действие подтверждения — своё у каждого экрана. */
  readonly action: (form: FormData) => Promise<void>;
  /** Скрытые поля формы: что именно подтверждают. Поле подтверждения добавит окно. */
  readonly fields: Readonly<Record<string, string>>;
}

/** Поле, по которому действие отличает подтверждённый запрос от первого нажатия. */
const CONFIRMED_FIELD = "confirmed";

export function ConfirmDialog({
  name,
  title,
  warning,
  confirmLabel,
  cancelLabel,
  cancelHref,
  action,
  fields,
}: ConfirmDialogProps): ReactElement {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = `${name}-dialog-title`;

  // Фокус уходит В ОКНО, а не остаётся на странице под ним: иначе человек с клавиатуры
  // и экранный диктор продолжают ходить по экрану, не зная, что их о чём-то спросили.
  // Наводится на само окно, а не на подтверждающую кнопку: кнопка под фокусом
  // срабатывает пробелом или Enter — это второй промах вместо вопроса.
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
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={`${name}-dialog`}
        className={DIALOG_CLASS}
      >
        <div className={DIALOG_HEAD_CLASS}>
          <h2 id={titleId} className={DIALOG_TITLE_CLASS}>
            {title}
          </h2>
        </div>

        <div className={DIALOG_BODY_CLASS}>
          <p data-testid={`${name}-warning`} className={NOTICE_WARN_CLASS}>
            {warning}
          </p>
        </div>

        {/* Порядок кнопок — подвала эталона и окна регулярности редактора: сперва
            отход, потом действие (T267). Человек, привыкший к тому окну, нажимает
            по памяти в то же место; у опасного действия цена этой привычки —
            перевыпущенный код вместо отмены. */}
        <div className={DIALOG_FOOT_CLASS}>
          <Link
            href={cancelHref}
            data-testid={`${name}-cancel`}
            className={BTN_GHOST_CLASS}
          >
            {cancelLabel}
          </Link>
          <form action={action}>
            {Object.entries(fields).map(([field, value]) => (
              <input key={field} type="hidden" name={field} value={value} />
            ))}
            <input type="hidden" name={CONFIRMED_FIELD} value="1" />
            <button
              type="submit"
              data-testid={`${name}-confirm`}
              className={BTN_PRIMARY_CLASS}
            >
              {confirmLabel}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
