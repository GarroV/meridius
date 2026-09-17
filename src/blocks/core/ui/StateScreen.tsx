import type { ReactElement, ReactNode } from "react";

/**
 * Одно из состояний сотруднической поверхности — всё, что человек с телефона
 * видит вместо экрана: «отправлено», «ссылка недействительна», «для станции
 * нет чек-листа», «такого адреса нет», «страница не открылась». Компонент
 * чисто презентационный — ни языков, ни данных он не знает, все строки уже
 * готовы в props (см. контракт вызывающей стороны).
 *
 * Живёт в `core`, а не в `fill`: с T213 его берут и маршруты продукта
 * (`src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`).
 * До переноса публичные пути рисовали админскую карточку `StatusCard` —
 * рамка и тень на сером канвасе вместо полного экрана, — и сотрудник на
 * кухне получал экран, сделанный для кабинета. Границы модулей
 * (`.dependency-cruiser.cjs`) запрещают `core` импортировать `fill`, так что
 * общая вещь и лежит в `core`, доступном каждому блоку.
 *
 * Эталон — `docs/furca/design/screens/states.html` (блоки «Отправлено»,
 * «Ссылка недействительна», «Для станции нет чек-листа», «Нет сети при
 * отправке»). Разметка того эталона написана классами `.fill`/`.center`/
 * `.big`/`.muted`/`.notice`/`.ok-mark`/`.btn--primary.btn--fill` (сами
 * классы — `docs/furca/design/app.css` и локальный `<style>` в states.html),
 * здесь она перенесена на утилиты Tailwind поверх тех же токенов — так же,
 * как это уже сделано в `PreviewScreen.tsx`.
 */

export interface StateScreenProps {
  /** Значение data-testid на корневом элементе: по нему экран находят сквозные сценарии. */
  readonly testId: string;
  /** "ok" — над заголовком зелёная отметка-галочка; "plain" — без неё. */
  readonly tone: "ok" | "plain";
  readonly title: string;
  /** Строки мелким шрифтом под заголовком, каждая с новой строки. Может быть пустым. */
  readonly meta?: readonly string[];
  /** Абзац объяснения под заголовком. Может отсутствовать. */
  readonly text?: string;
  /** Плашка внизу. Может отсутствовать. */
  readonly notice?: string;
  /**
   * Цвет плашки: "warn" — предупреждение (умолчание, как у «отправлено, но
   * критический пункт провален»), "err" — отказ. Разный цвет здесь и нужен
   * затем, чтобы «сломалось» не читалось как «здесь пока пусто» (T214).
   */
  readonly noticeTone?: "warn" | "err";
  /**
   * Единственное действие экрана — выход из тупика. Кнопка или ссылка,
   * одетая в `STATE_ACTION_CLASS`. Может отсутствовать: у «нет чек-листа»
   * выхода нет, человек просто уходит.
   */
  readonly action?: ReactNode;
  /** Мелкая строка под действием — например, код ошибки для поддержки. */
  readonly note?: ReactNode;
}

// Корень — аналог `.fill` из app.css: экран заполнения шириной не больше
// 420px по центру, во всю высоту, фон var(--surface). В самом `.fill`
// центрирования нет — оно добавлено демо-обёрткой `.box .fill { justify-
// content: center }` в states.html, здесь оно перенесено прямо на корень,
// потому что единственный ребёнок и есть тот самый центрируемый блок.
const ROOT_CLASS =
  "mx-auto flex min-h-screen w-full max-w-[420px] flex-col items-center justify-center bg-surface";

// Аналог `.center` (локальный <style> states.html): колонка, центр по обеим
// осям, текст по центру, зазор между блоками var(--space-6), внешние
// отступы var(--space-10) (верт.) / var(--space-8) (гориз.), как в
// `padding: var(--space-10) var(--space-8)` эталона. `break-words`
// (overflow-wrap — наследуемое свойство) закрывает требование «без
// горизонтальной прокрутки на 375px»: длинное слово переносится в любом
// потомке — заголовке, тексте, плашке. `min-w-0` снимает с этого блока как
// с flex-элемента корня умолчание `min-width: auto`, которое иначе не даёт
// тексту сжаться для переноса.
const CENTER_CLASS =
  "flex w-full min-w-0 flex-col items-center gap-[var(--space-6)] px-[var(--space-8)] py-[var(--space-10)] text-center break-words";

// Аналог `.big`: заголовок состояния.
const TITLE_CLASS =
  "text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold";

// Аналог `.muted`: цвет var(--ink-2), используется и для строк `meta`,
// и для абзаца `text` — в эталоне это один и тот же класс на обеих ролях.
const MUTED_CLASS = "text-[var(--ink-2)]";

// Строки `meta` разделяются переносом, а не склеиваются в одну: `white-
// space: pre-line` сохраняет переносы из `join("\n")`, но схлопывает
// повторяющиеся пробелы внутри строки.
const META_CLASS = `whitespace-pre-line ${MUTED_CLASS}`;

// Аналог `.notice`: скругление var(--r-block), текст var(--fs-dense).
// В эталоне у плашки `style="text-align:left"` поверх унаследованного
// от `.center` центрирования — `text-left` здесь делает то же самое.
const NOTICE_BASE_CLASS =
  "w-full rounded-[var(--r-block)] border px-[var(--space-7)] py-[var(--space-6)] text-left text-[length:var(--fs-dense)]";
// `.notice--warn`: фон var(--warn-soft), рамка var(--warn-line), цвет var(--warn-ink).
const NOTICE_WARN_CLASS = `${NOTICE_BASE_CLASS} border-[var(--warn-line)] bg-[var(--warn-soft)] text-[var(--warn-ink)]`;
// `.notice--err`: фон var(--err-soft), рамка var(--err-line), цвет var(--err).
const NOTICE_ERR_CLASS = `${NOTICE_BASE_CLASS} border-[var(--err-line)] bg-[var(--err-soft)] text-[var(--err)]`;

/**
 * Единственное действие полноэкранного состояния — акцентная кнопка во всю
 * ширину: `.btn.btn--primary.btn--fill` из эталона с его же ограничением
 * `max-width:280px` (блок «Нет сети при отправке» в states.html). Кнопка и
 * ссылка выглядят одинаково: на этих экранах действие всегда одно и оно и
 * есть выход из тупика (T213).
 */
export const STATE_ACTION_CLASS =
  "bg-accent inline-flex h-[52px] w-full max-w-[280px] cursor-pointer items-center justify-center gap-[var(--space-4)] rounded-[var(--r-block)] border border-[var(--accent)] text-[length:var(--fs-title)] leading-none font-medium text-[var(--ink-inverse)] no-underline hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]";

// Мелкая строка под действием — код ошибки для поддержки. Тот же вид, что у
// такой же строки админской карточки состояния: var(--fs-meta), var(--ink-3),
// цифровая гарнитура, чтобы код читался вслух по телефону.
const NOTE_CLASS =
  "font-num m-0 text-[length:var(--fs-meta)] text-[var(--ink-3)]";

// Кружок `.ok-mark`: 56×56, скругление 50%, фон var(--ok-soft), рамка
// var(--ok-line).
const OK_MARK_CLASS =
  "flex h-[56px] w-[56px] items-center justify-center rounded-full border border-[var(--ok-line)] bg-[var(--ok-soft)]";

/**
 * Галочка внутри `.ok-mark`. В эталоне она нарисована CSS-маской с
 * инлайновым SVG в data-URI; здесь тот же контур ("polyline points='20 6 9
 * 17 4 12'", viewBox 24×24) — обычный инлайновый `<svg>`, как проще в React.
 * Размер 26×26, цвет var(--ok), stroke-width 3, скруглённые концы линии.
 */
function OkMark(): ReactElement {
  return (
    <span className={OK_MARK_CLASS}>
      <svg
        width={26}
        height={26}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ok)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

export function StateScreen({
  testId,
  tone,
  title,
  meta,
  text,
  notice,
  noticeTone = "warn",
  action,
  note,
}: StateScreenProps): ReactElement {
  // Пустой `meta` не должен оставлять в разметке пустой блок — только
  // непустой список строк превращается в текст с переносами.
  const metaText =
    meta !== undefined && meta.length > 0 ? meta.join("\n") : null;

  return (
    <main data-testid={testId} className={ROOT_CLASS}>
      <div className={CENTER_CLASS}>
        {tone === "ok" ? <OkMark /> : null}
        <h1 className={TITLE_CLASS}>{title}</h1>
        {metaText !== null ? <p className={META_CLASS}>{metaText}</p> : null}
        {text !== undefined ? <p className={MUTED_CLASS}>{text}</p> : null}
        {notice !== undefined ? (
          <div
            className={
              noticeTone === "err" ? NOTICE_ERR_CLASS : NOTICE_WARN_CLASS
            }
          >
            {notice}
          </div>
        ) : null}
        {action}
        {note === undefined ? null : <p className={NOTE_CLASS}>{note}</p>}
      </div>
    </main>
  );
}
