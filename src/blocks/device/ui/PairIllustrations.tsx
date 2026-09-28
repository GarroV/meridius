// Схемы к шагам инструкции «как привязать планшет» (D163): макет экрана, а не картинка.
//
// Инлайн-SVG, а не файлы: внешних картинок у продукта нет, а схема обязана жить в обеих
// темах. Поэтому цвета — токены ядра через классы (`fill-[var(--surface)]`), а не
// значения: тёмная тема перекрашивает схему сама. Надписи на схемах — не слова, а
// условные полоски и цифры: переводить их не нужно, а смысл шага говорит подпись рядом.
import type { ReactElement, ReactNode } from "react";

const FRAME = "fill-[var(--surface)] stroke-[var(--line-strong)]";
const SCREEN = "fill-[var(--surface-2)] stroke-[var(--line)]";
const BAR = "fill-[var(--line-strong)]";
const ACCENT = "fill-[var(--accent)]";
const ACCENT_SOFT = "fill-[var(--accent-soft)] stroke-[var(--accent)]";
const OK = "fill-[var(--ok)]";
const DIGIT =
  "fill-[var(--ink)] font-[family-name:var(--font-num)] text-[13px] font-semibold";

function Figure({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 160 100"
      aria-hidden="true"
      focusable="false"
      className="h-auto w-full"
    >
      {children}
    </svg>
  );
}

/** Планшет: рамка с экраном, внутри которого рисует шаг. */
function Tablet({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <>
      <rect x="28" y="6" width="104" height="88" rx="9" className={FRAME} />
      <rect x="35" y="13" width="90" height="74" rx="4" className={SCREEN} />
      {children}
    </>
  );
}

/** Шаг 1: кабинет — список станций, у выбранной кнопка, над ней код из четырёх цифр. */
export function CabinetFigure(): ReactElement {
  return (
    <Figure>
      <rect x="8" y="8" width="144" height="84" rx="6" className={FRAME} />
      <rect x="8" y="8" width="30" height="84" rx="6" className={SCREEN} />
      <rect x="46" y="18" width="46" height="5" rx="2.5" className={BAR} />
      <rect x="46" y="32" width="40" height="4" rx="2" className={BAR} />
      <rect x="46" y="44" width="34" height="4" rx="2" className={BAR} />
      <rect x="46" y="56" width="38" height="4" rx="2" className={BAR} />
      <rect x="96" y="18" width="50" height="68" rx="4" className={SCREEN} />
      <text x="121" y="46" textAnchor="middle" className={DIGIT}>
        4 8 1 7
      </text>
      <rect x="102" y="62" width="38" height="12" rx="3" className={ACCENT} />
    </Figure>
  );
}

/** Шаг 2: браузер планшета — строка адреса выделена. */
export function AddressFigure(): ReactElement {
  return (
    <Figure>
      <Tablet>
        <rect
          x="41"
          y="19"
          width="78"
          height="12"
          rx="6"
          className={ACCENT_SOFT}
        />
        <rect
          x="47"
          y="23.5"
          width="40"
          height="3"
          rx="1.5"
          className={ACCENT}
        />
        <rect x="47" y="42" width="50" height="5" rx="2.5" className={BAR} />
        <rect x="47" y="53" width="66" height="4" rx="2" className={BAR} />
        <rect x="47" y="62" width="58" height="4" rx="2" className={BAR} />
      </Tablet>
    </Figure>
  );
}

/** Шаг 3: четыре клетки кода и кнопка «Привязать». */
export function CodeFigure(): ReactElement {
  const cells = [0, 1, 2, 3];
  const digits = ["4", "8", "1", "7"];
  return (
    <Figure>
      <Tablet>
        <rect x="52" y="22" width="56" height="5" rx="2.5" className={BAR} />
        {cells.map((cell) => (
          <g key={cell}>
            <rect
              x={48 + cell * 17}
              y="36"
              width="13"
              height="17"
              rx="3"
              className={ACCENT_SOFT}
            />
            <text
              x={54.5 + cell * 17}
              y="49"
              textAnchor="middle"
              className={DIGIT}
            >
              {digits[cell]}
            </text>
          </g>
        ))}
        <rect x="52" y="63" width="56" height="13" rx="3" className={ACCENT} />
      </Tablet>
    </Figure>
  );
}

/** Шаг 4: чек-лист станции открыт сам — пункты с галочками. */
export function ChecklistFigure(): ReactElement {
  const rows = [0, 1, 2];
  return (
    <Figure>
      <Tablet>
        <rect x="42" y="19" width="48" height="6" rx="3" className={BAR} />
        {rows.map((row) => (
          <g key={row}>
            <rect
              x="42"
              y={33 + row * 15}
              width="10"
              height="10"
              rx="3"
              className={row < 2 ? OK : SCREEN}
            />
            {row < 2 ? (
              <path
                d={`M44.5 ${String(38 + row * 15)} l2 2 l4 -4`}
                className="fill-none stroke-[var(--surface)]"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            <rect
              x="58"
              y={36 + row * 15}
              width={50 - row * 8}
              height="4"
              rx="2"
              className={BAR}
            />
          </g>
        ))}
      </Tablet>
    </Figure>
  );
}
