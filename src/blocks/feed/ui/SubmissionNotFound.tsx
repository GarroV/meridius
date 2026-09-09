import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { AdminShell } from "@/blocks/core/ui/AdminShell";

import { FEED_PATH } from "../routes";

/**
 * Заполнения с таким идентификатором нет: объяснение и кнопка обратно в ленту.
 * Тот же характер пустого состояния, что у `FeedEmpty.tsx` (карточка с `.empty`),
 * но причина здесь всегда одна, поэтому без разбора по `FeedEmptyKind`.
 */

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const EMPTY_CLASS =
  "flex flex-col items-center gap-[var(--space-5)] px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]";
const TITLE_CLASS =
  "text-ink m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const TEXT_CLASS = "m-0 max-w-[520px]";
const BTN_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";

export async function SubmissionNotFound(): Promise<ReactElement> {
  const t = await getTranslations("feed.card");
  const section = await getTranslations("feed");

  return (
    <AdminShell
      testId="submission-not-found"
      active="feed"
      narrow
      breadcrumb={
        <Link href={FEED_PATH} className="underline">
          {t("back")}
        </Link>
      }
      // В шапке — раздел, а не тот же текст, что в карточке: заголовок дважды
      // подряд читается как сбой вёрстки, а объяснение всё равно ниже.
      title={section("title")}
      topbarAction={null}
    >
      <div className={CARD_CLASS}>
        <div className={EMPTY_CLASS}>
          <p className={TITLE_CLASS}>{t("notFoundTitle")}</p>
          <p className={TEXT_CLASS}>{t("notFoundText")}</p>
          <Link href={FEED_PATH} className={BTN_CLASS}>
            {t("notFoundAction")}
          </Link>
        </div>
      </div>
    </AdminShell>
  );
}
