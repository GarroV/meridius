import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

import type { RoundsEmptyKind } from "../rounds-model";
import { ROUNDS_REPORT_PATH } from "../routes";

/**
 * Пустая сетка отчёта объясняет причину и следующий шаг — тот же приём, что у
 * `FeedEmpty.tsx`: три причины различаются, потому что за ними три разных действия.
 * `noChecklists` и `noSchedule` оба ведут в чек-листы (там и заводят чек-лист, и
 * задают интервал обхода), а `noPasses` — данные есть, просто не за этот период, и
 * там ведёт к самому себе же (сброс фильтров), а не в справочник.
 *
 * Адрес чек-листов берётся из `core/admin-sections`, а не своей копией строки: своя
 * копия однажды разъехалась с боковым меню молча (#11, T074).
 */
const CHECKLISTS_PATH = ADMIN_SECTIONS.checklists.path;

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const EMPTY_CLASS =
  "flex flex-col items-center gap-[var(--space-5)] px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]";
const TITLE_CLASS =
  "text-ink m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const TEXT_CLASS = "m-0 max-w-[520px]";
const BTN_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";

const CONTENT: Record<
  RoundsEmptyKind,
  { title: string; text: string; action: string; href: string }
> = {
  noChecklists: {
    title: "noChecklistsTitle",
    text: "noChecklistsText",
    action: "noChecklistsAction",
    href: CHECKLISTS_PATH,
  },
  noSchedule: {
    title: "noScheduleTitle",
    text: "noScheduleText",
    action: "noScheduleAction",
    href: CHECKLISTS_PATH,
  },
  noPasses: {
    title: "noPassesTitle",
    text: "noPassesText",
    action: "noPassesAction",
    href: ROUNDS_REPORT_PATH,
  },
};

export async function RoundsEmpty({
  kind,
}: {
  readonly kind: RoundsEmptyKind;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.report.empty");
  const content = CONTENT[kind];

  return (
    <div className={CARD_CLASS}>
      <div className={EMPTY_CLASS} data-testid="rounds-empty" data-kind={kind}>
        <p className={TITLE_CLASS}>{t(content.title)}</p>
        <p className={TEXT_CLASS}>{t(content.text)}</p>
        <Link href={content.href} className={BTN_CLASS}>
          {t(content.action)}
        </Link>
      </div>
    </div>
  );
}
