// Вводный блок раздела кабинета: зачем раздел, что здесь делают, что дальше (D152, T316).
//
// Владелец: «инструкции в целом во всех поверхностях нужны. чтобы было понимание для чего
// раздел, какая цель и прочее». Текст стоит на самом экране, а не во всплывающей
// подсказке и не в справке: читается один раз и дальше не мешает — три короткие строки.
//
// Вид — плашка `.notice` эталона (`design/screens/library.html`, `design/app.css`):
// нейтральная, без акцента — это пояснение, а не тревога. До T316 три раздела рисовали
// вводную строку каждый своей копией этого класса; копия теперь одна.
//
// Серверный компонент со своим пространством словаря `sectionIntro`: на клиент словарь
// не уходит. Разделам мастер-детали (`MasterDetail`) блок передаётся готовой разметкой.
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { IntroSectionKey } from "../section-intro";
import { Icon } from "./Icon";

const NOTICE_CLASS =
  "flex gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const WHY_CLASS = "m-0 font-semibold text-ink";
const TEXT_CLASS = "m-0 text-[var(--ink-2)]";

export interface SectionIntroProps {
  readonly section: IntroSectionKey;
}

export async function SectionIntro({
  section,
}: SectionIntroProps): Promise<ReactElement> {
  const t = await getTranslations("sectionIntro");

  return (
    <section
      aria-label={t("label")}
      data-testid="section-intro"
      data-section={section}
      className={NOTICE_CLASS}
    >
      <Icon
        name="info"
        className="mt-[var(--space-1)] size-4 flex-none text-[var(--ink-3)]"
      />
      <div className="flex min-w-0 flex-col gap-[var(--space-2)]">
        <p className={WHY_CLASS}>{t(`${section}.why`)}</p>
        <p className={TEXT_CLASS}>{t(`${section}.what`)}</p>
        <p className={TEXT_CLASS}>{t(`${section}.next`)}</p>
      </div>
    </section>
  );
}
