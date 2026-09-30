import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { AdminPage } from "@/blocks/core/ui/AdminPage";
import { SectionIntro } from "@/blocks/core/ui/SectionIntro";

import { NEW_CHECKLIST_PATH } from "../routes";

/**
 * Рабочая зона раздела «Чек-листы», пока ничего не выбрано (D162). Не пустое место, а
 * подсказка: человек, впервые открывший раздел, видит список слева и должен понять,
 * что чек-лист откроется здесь же, а не на отдельной странице.
 */

const CARD_CLASS =
  "bg-surface flex max-w-2xl flex-col items-start gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line-strong)] p-[var(--space-8)] shadow-[var(--sh-xs)]";
const TITLE_CLASS =
  "m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold text-ink";
const HINT_CLASS =
  "m-0 text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";
const BTN_PRIMARY_CLASS =
  "bg-accent inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] no-underline hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] hover:text-[var(--ink-inverse)] hover:no-underline";

export async function ChecklistsHome(): Promise<ReactElement> {
  const t = await getTranslations("editor");

  return (
    <AdminPage
      testId="checklists-home"
      breadcrumb={t("list.crumbs")}
      title={t("list.title")}
      topbarAction={null}
    >
      {/* D152. Ниже складки этой зоны не видно — там блок стоит над колонкой списка
          (`ChecklistsWorkspace`). */}
      <SectionIntro section="checklists" />
      <div className={CARD_CLASS} data-testid="checklists-pick">
        <p className={TITLE_CLASS}>{t("rail.pickTitle")}</p>
        <p className={HINT_CLASS}>{t("rail.pickHint")}</p>
        <Link
          href={NEW_CHECKLIST_PATH}
          className={BTN_PRIMARY_CLASS}
          data-testid="checklists-home-new"
        >
          {t("list.new")}
        </Link>
      </div>
    </AdminPage>
  );
}
