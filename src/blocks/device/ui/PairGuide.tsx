// Пошаговая инструкция «как привязать планшет в пиццерии» (D163).
//
// Владелец: «я не понимаю как привязать планшет в пиццерии … чтобы была прям визуальная
// инструкция а что сделать то надо». Поэтому инструкция — не абзац, а четыре шага со
// схемой экрана у каждого и с НАСТОЯЩИМ адресом, который набирают на планшете. Читает её
// управляющий пиццерии, а не разработчик: ни слова «пин», «кука», «сессия».
//
// Одна на два места — экран раздела и выдвижную панель рядом с кодом: две копии текста
// разошлись бы при первой правке. Разница только в плотности (`compact`): в панели
// ширина 560 px, и шаги идут столбцом с маленькой схемой.
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import {
  AddressFigure,
  CabinetFigure,
  ChecklistFigure,
  CodeFigure,
} from "./PairIllustrations";

const STEPS = [
  { key: "step1", Figure: CabinetFigure },
  { key: "step2", Figure: AddressFigure },
  { key: "step3", Figure: CodeFigure },
  { key: "step4", Figure: ChecklistFigure },
] as const;

const TROUBLES = [
  "expired",
  "tooOften",
  "unpaired",
  "nothing",
  "move",
] as const;

const CARD_CLASS =
  "bg-surface flex flex-col gap-[var(--space-6)] rounded-[var(--r-block)] border border-[var(--line-strong)] p-[var(--space-7)] shadow-[var(--sh-xs)]";
const TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold text-ink";
const LEAD_CLASS =
  "text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";
// Четыре шага в ряд на широком экране, по два — на среднем, столбцом — на телефоне.
const GRID_CLASS =
  "grid list-none grid-cols-1 gap-[var(--space-6)] p-0 sm:grid-cols-2 xl:grid-cols-4";
const COMPACT_LIST_CLASS = "flex list-none flex-col gap-[var(--space-5)] p-0";
const STEP_CLASS =
  "flex flex-col gap-[var(--space-4)] rounded-[var(--r-block)] border border-[var(--line)] bg-[var(--surface-2)] p-[var(--space-6)]";
const COMPACT_STEP_CLASS =
  "flex items-start gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line)] bg-[var(--surface-2)] p-[var(--space-5)]";
const FIGURE_CLASS = "w-full max-w-[220px] self-center";
const COMPACT_FIGURE_CLASS = "w-[96px] shrink-0";
const NUMBER_CLASS =
  "inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[length:var(--fs-meta)] font-semibold text-[var(--ink-inverse)]";
const STEP_TITLE_CLASS =
  "flex items-center gap-[var(--space-4)] text-[length:var(--fs-body)] font-semibold text-ink";
const STEP_TEXT_CLASS =
  "text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";
// Адрес набирают руками — поэтому моноширинным, крупно и с переносом по любому знаку:
// на 375 px длинный адрес иначе вылезает за край карточки.
const ADDRESS_CLASS =
  "rounded-[var(--r-control)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-[var(--space-4)] py-[var(--space-2)] font-[family-name:var(--font-num)] text-[length:var(--fs-dense)] font-semibold break-all text-[var(--accent)]";
const TROUBLE_TITLE_CLASS =
  "text-[length:var(--fs-lead)] font-semibold text-ink";
const TROUBLE_LIST_CLASS =
  "flex list-disc flex-col gap-[var(--space-3)] pl-[var(--space-8)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";

export interface PairGuideProps {
  /** Что набрать на планшете: полный адрес страницы привязки. */
  readonly address: string;
  /** Сколько минут живёт код — из `pin.ts`, а не из текста. */
  readonly minutes: number;
  /** Плотный вид для выдвижной панели: шаги столбцом, схема маленькая. */
  readonly compact?: boolean;
}

export async function PairGuide({
  address,
  minutes,
  compact = false,
}: PairGuideProps): Promise<ReactElement> {
  const t = await getTranslations("device.guide");

  const steps = (
    <ol className={compact ? COMPACT_LIST_CLASS : GRID_CLASS}>
      {STEPS.map(({ key, Figure }, index) => (
        <li
          key={key}
          data-testid="pair-guide-step"
          className={compact ? COMPACT_STEP_CLASS : STEP_CLASS}
        >
          <div className={compact ? COMPACT_FIGURE_CLASS : FIGURE_CLASS}>
            <Figure />
          </div>
          <div className="flex min-w-0 flex-col gap-[var(--space-3)]">
            <span className={STEP_TITLE_CLASS}>
              <span className={NUMBER_CLASS}>{index + 1}</span>
              {t(`${key}.title`)}
            </span>
            <span className={STEP_TEXT_CLASS}>
              {t(`${key}.text`, { minutes })}
            </span>
            {key === "step2" ? (
              <code data-testid="pair-guide-address" className={ADDRESS_CLASS}>
                {address}
              </code>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );

  const troubles = (
    <div className="flex flex-col gap-[var(--space-4)]">
      <h3 className={TROUBLE_TITLE_CLASS}>{t("trouble.title")}</h3>
      <ul className={TROUBLE_LIST_CLASS}>
        {TROUBLES.map((key) => (
          <li key={key}>{t(`trouble.${key}`, { minutes })}</li>
        ))}
      </ul>
    </div>
  );

  if (compact) {
    return (
      <div
        data-testid="pair-guide"
        className="flex flex-col gap-[var(--space-6)]"
      >
        {steps}
        {troubles}
      </div>
    );
  }

  return (
    <section
      id="pair-guide"
      data-testid="pair-guide"
      aria-labelledby="pair-guide-title"
      className={CARD_CLASS}
    >
      <div className="flex flex-col gap-[var(--space-2)]">
        <h2 id="pair-guide-title" className={TITLE_CLASS}>
          {t("title")}
        </h2>
        <p className={LEAD_CLASS}>{t("lead")}</p>
      </div>
      {steps}
      {troubles}
    </section>
  );
}
