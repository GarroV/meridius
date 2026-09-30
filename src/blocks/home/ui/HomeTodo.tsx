import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { CHECKLISTS_PATH } from "@/blocks/editor/routes";
import { feedHref, type FeedView } from "@/blocks/feed/view";

import { CARD_CLASS, HEAD_CLASS, TITLE_CLASS } from "./style";

const ROW_CLASS =
  "flex items-center gap-[var(--space-5)] border-b border-[var(--line)] px-[var(--space-7)] py-[var(--space-5)] text-[length:var(--fs-body)] text-ink no-underline last:border-b-0 hover:bg-[var(--surface-2)]";
const COUNT_CLASS =
  "min-w-[2ch] font-[family-name:var(--font-num)] text-[length:var(--fs-lead)] font-semibold [font-variant-numeric:tabular-nums]";
const GO_CLASS = "ml-auto text-[length:var(--fs-meta)] text-[var(--ink-3)]";

interface TodoRow {
  readonly key: "noChecklist" | "silent" | "drafts";
  readonly count: number;
  readonly href: string;
}

/**
 * «Что не закрыто» (`specs/2026-09-25-user-flow.md` §4.1): список дел, а не сущностей.
 * Порядок — по цене: сначала то, что делает продукт неработающим, потом устаревшим.
 * Дел нет — блока нет: пустой список «всё хорошо» это шум.
 */
export async function HomeTodo({
  gaps,
  drafts,
  view,
}: {
  readonly gaps: { readonly noChecklist: number; readonly silent: number };
  readonly drafts: number;
  readonly view: FeedView;
}): Promise<ReactElement | null> {
  const t = await getTranslations("adminHome.todo");
  const rows: readonly TodoRow[] = [
    {
      key: "noChecklist" as const,
      count: gaps.noChecklist,
      href: ADMIN_SECTIONS.stations.path,
    },
    {
      key: "silent" as const,
      count: gaps.silent,
      href: feedHref({ ...view, period: "today" }),
    },
    { key: "drafts" as const, count: drafts, href: CHECKLISTS_PATH },
  ].filter((row) => row.count > 0);

  if (rows.length === 0) return null;

  return (
    <section className={CARD_CLASS} data-testid="home-todo">
      <div className={HEAD_CLASS}>
        <h2 className={TITLE_CLASS}>{t("title")}</h2>
      </div>
      {rows.map((row) => (
        <Link
          key={row.key}
          href={row.href}
          className={ROW_CLASS}
          data-testid={`home-todo-${row.key}`}
        >
          <span className={COUNT_CLASS}>{row.count}</span>
          <span>{t(row.key, { count: row.count })}</span>
          <span className={GO_CLASS} aria-hidden="true">
            →
          </span>
        </Link>
      ))}
    </section>
  );
}
