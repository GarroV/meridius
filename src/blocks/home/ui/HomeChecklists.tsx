// «Мои чек-листы» (D148) на пульте: вошедший сразу видит СВОИ чек-листы, а когда их нет
// вовсе — одно предложение сделать первый из шаблона. «Свои» — ровно то, что он видит в
// разделе «Чек-листы» (D145). Фильтра области у главной нет с D183.
//
// Перенесено из прежней главной `core/ui/AdminHome` (T315) при слиянии с пультом D174;
// её полоса «станций без чек-листа» и лента заполнений у пульта свои — «Что не закрыто»
// и «Что происходит», двух копий одного не держим.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { STATUS_ACTION_CLASS, StatusCard } from "@/blocks/core/ui/StatusCard";

import type { HomeChecklist } from "../load";
import {
  CARD_CLASS,
  COUNT_CLASS,
  HEAD_CLASS,
  META_CLASS,
  TITLE_CLASS,
} from "./style";

const LIST_CLASS = "m-0 flex list-none flex-col p-[var(--space-3)]";
const ROW_CLASS =
  "text-ink flex items-start justify-between gap-[var(--space-5)] rounded-[var(--r-control)] px-[var(--space-5)] py-[var(--space-4)] no-underline hover:bg-[var(--surface-2)] hover:text-ink hover:no-underline";
const ROW_NAME_CLASS =
  "text-[length:var(--fs-body)] leading-[var(--lh-body)] font-medium [overflow-wrap:anywhere]";
const SIDE_CLASS = `${META_CLASS} shrink-0 [font-variant-numeric:tabular-nums]`;
const DRAFT_CLASS =
  "shrink-0 rounded-[var(--r-mark)] bg-[var(--warn-soft)] px-[var(--space-3)] text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--warn-ink)]";

export async function HomeChecklists({
  checklists,
  total,
}: {
  readonly checklists: readonly HomeChecklist[];
  readonly total: number;
}): Promise<ReactElement | null> {
  const t = await getTranslations("adminHome");

  if (total === 0) {
    return (
      <StatusCard
        testId="home-empty"
        title={t("emptyTitle")}
        text={t("emptyText")}
        action={
          <Link
            href={ADMIN_SECTIONS.templates.path}
            data-testid="home-from-template"
            className={STATUS_ACTION_CLASS}
          >
            {t("emptyAction")}
          </Link>
        }
      />
    );
  }

  return (
    <section className={CARD_CLASS} data-testid="home-checklists">
      <div className={HEAD_CLASS}>
        <h2 className={`${TITLE_CLASS} m-0`}>{t("checklistsTitle")}</h2>
        <Link
          href={ADMIN_SECTIONS.checklists.path}
          className={`${COUNT_CLASS} no-underline hover:underline`}
        >
          {t("checklistsAll", { count: total })}
        </Link>
      </div>
      <ul className={LIST_CLASS}>
        {checklists.map((checklist) => (
          <li key={checklist.id}>
            <Link href={checklist.href} className={ROW_CLASS}>
              <span className="flex min-w-0 flex-col gap-[var(--space-1)]">
                <span className={ROW_NAME_CLASS}>{checklist.title}</span>
                <span className={META_CLASS}>
                  {checklist.place ?? t("noStation")}
                </span>
              </span>
              {checklist.publishedNumber === null ? (
                <span className={DRAFT_CLASS}>{t("unpublished")}</span>
              ) : (
                <span className={SIDE_CLASS}>
                  {t("version", { number: checklist.publishedNumber })}
                  {checklist.hasUnpublishedChanges ? ` · ${t("changed")}` : ""}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
