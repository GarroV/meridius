// Вводный блок раздела кабинета: зачем раздел, что здесь делают, что дальше (D152, T316).
//
// Владелец: «инструкции в целом во всех поверхностях нужны. чтобы было понимание для чего
// раздел, какая цель и прочее». Текст стоит на самом экране, а не во всплывающей
// подсказке и не в справке: читается один раз и дальше не мешает — три короткие строки.
//
// Вид — тихая строка без заливки и рамки: это пояснение, а не тревога и не содержание.
// Блок закрывается и помнит это (`IntroFrame`): методисту, который знает раздел, он не
// должен съедать верх экрана каждый день. До T316 три раздела рисовали вводную строку
// каждый своей копией; копия теперь одна.
//
// Серверный компонент со своим пространством словаря `sectionIntro`: на клиент словарь
// не уходит. Разделам мастер-детали (`MasterDetail`) блок передаётся готовой разметкой.
//
// D189: первая строка видна постоянно, подробности раскрываются на любой ширине.
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { IntroSectionKey } from "../section-intro";
import { IntroFrame } from "./IntroFrame";

const WHY_CLASS = "m-0 text-[var(--ink-2)]";
const TEXT_CLASS = "m-0 text-[var(--ink-2)]";
const REST_CLASS = "flex flex-col gap-[var(--space-2)]";
const MORE_CLASS =
  "w-fit cursor-pointer font-medium text-[var(--accent)] marker:text-[var(--ink-3)]";

export interface SectionIntroProps {
  readonly section: IntroSectionKey;
}

export async function SectionIntro({
  section,
}: SectionIntroProps): Promise<ReactElement> {
  const t = await getTranslations("sectionIntro");

  return (
    <IntroFrame
      section={section}
      label={t("label")}
      hideLabel={t("hide")}
      showLabel={t("label")}
    >
      <p className={WHY_CLASS}>{t(`${section}.why`)}</p>
      <details data-testid="section-intro-more">
        <summary className={MORE_CLASS}>{t("more")}</summary>
        <div className={`${REST_CLASS} pt-[var(--space-2)]`}>
          <p className={TEXT_CLASS}>{t(`${section}.what`)}</p>
          <p className={TEXT_CLASS}>{t(`${section}.next`)}</p>
        </div>
      </details>
    </IntroFrame>
  );
}
