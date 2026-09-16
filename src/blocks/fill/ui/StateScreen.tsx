import type { ReactElement } from "react";

/**
 * Одно из состояний экрана сотрудника вне самого заполнения: «отправлено»,
 * «ссылка недействительна», «для станции нет чек-листа». Компонент чисто
 * презентационный — ни языков, ни данных он не знает, все строки уже
 * готовы в props (см. контракт вызывающей стороны).
 *
 * Эталон — `docs/furca/design/screens/states.html` (блоки «Отправлено»,
 * «Ссылка недействительна», «Для станции нет чек-листа»). Разметка того
 * эталона написана классами `.fill`/`.center`/`.big`/`.muted`/`.notice`/
 * `.ok-mark` (сами классы — `docs/furca/design/app.css` и локальный
 * `<style>` в states.html), здесь она перенесена на утилиты Tailwind поверх
 * тех же токенов — так же, как это уже сделано в `PreviewScreen.tsx`.
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
  /** Плашка-предупреждение внизу (стиль notice--warn). Может отсутствовать. */
  readonly notice?: string;
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

// Аналог `.notice.notice--warn`: фон var(--warn-soft), рамка var(--warn-
// line), цвет var(--warn-ink), скругление var(--r-block), текст var(--fs-
// dense). В эталоне у плашки `style="text-align:left"` поверх унаследованного
// от `.center` центрирования — `text-left` здесь делает то же самое.
const NOTICE_CLASS =
  "w-full rounded-[var(--r-block)] border border-[var(--warn-line)] bg-[var(--warn-soft)] px-[var(--space-7)] py-[var(--space-6)] text-left text-[length:var(--fs-dense)] text-[var(--warn-ink)]";

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
          <div className={NOTICE_CLASS}>{notice}</div>
        ) : null}
      </div>
    </main>
  );
}
