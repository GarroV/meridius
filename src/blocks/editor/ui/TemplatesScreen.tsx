import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { AdminShell } from "@/blocks/core/ui/AdminShell";
import { requireAdmin } from "@/blocks/auth/guard";

import { submitTakeTemplate } from "../actions";
import { pickEditorText } from "../localized-text";
import {
  NEW_TEMPLATE_PATH,
  checklistPath,
  checklistPreviewPath,
  templateRolloutPath,
} from "../routes";
import { listTemplateCards, type TemplateCard } from "../templates";

/**
 * Раздел «Шаблоны» (T309, D154). Шаблон — эталон УК, «так мы видим идеальную смену»:
 * он ничего не предписывает, его берут к себе копией и правят под себя. Поэтому у
 * карточки нет ни станции, ни счёта заполнений — только что это, какого размера и
 * насколько свежее, и два пути взять: сразу на станции или сначала к себе.
 *
 * Черновой шаблон здесь тоже виден, но взять его нельзя: копировать нечем, и кнопки,
 * которая кончится отказом, у него нет.
 */

const INTRO_CLASS =
  "rounded-[var(--r-block)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";
const GRID_CLASS =
  "grid gap-[var(--space-6)] [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]";
const CARD_CLASS =
  "bg-surface flex flex-col gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line-strong)] p-[var(--space-7)] shadow-[var(--sh-xs)]";
const CARD_TITLE_CLASS =
  "m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const META_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const ACTIONS_CLASS = "flex flex-wrap items-center gap-[var(--space-3)]";
const BTN_PRIMARY_CLASS =
  "bg-accent inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] no-underline hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]";
const BTN_SECONDARY_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--line-control-2)]";
const BTN_GHOST_SM_CLASS =
  "inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";
const TAG_CLASS =
  "inline-flex h-[20px] w-fit items-center rounded-[var(--r-mark)] border border-[var(--line-control)] px-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] whitespace-nowrap text-[var(--ink-3)] uppercase";
const EMPTY_CLASS =
  "bg-surface flex flex-col items-center gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line)] px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]";

async function TemplateCardView({
  card,
  canEdit,
}: {
  readonly card: TemplateCard;
  /** Править шаблон может только УК: у страны кнопки нет вовсе (user-flow §5.2, D149). */
  readonly canEdit: boolean;
}): Promise<ReactElement> {
  const t = await getTranslations("templates");
  const locale = await getLocale();
  const format = await getFormatter();
  const title = pickEditorText(card.title, locale);

  return (
    <article className={CARD_CLASS} data-testid="template-card">
      <h2 className={CARD_TITLE_CLASS} data-testid="template-title">
        {title === "" ? t("untitled") : title}
      </h2>
      <p className={META_CLASS}>
        {t("items", { count: card.itemCount })}
        {card.publishedAt === null
          ? null
          : ` · ${t("updated", {
              date: format.dateTime(card.publishedAt, {
                day: "numeric",
                month: "long",
                year: "numeric",
              }),
            })}`}
      </p>
      {card.publishedNumber === null ? (
        <span className={TAG_CLASS} data-testid="template-unpublished">
          {t("unpublished")}
        </span>
      ) : null}

      {card.publishedNumber === null ? null : (
        <div className={ACTIONS_CLASS}>
          <Link
            href={templateRolloutPath(card.id)}
            className={BTN_PRIMARY_CLASS}
            data-testid="template-take-to-stations"
          >
            {t("takeToStations")}
          </Link>
          <form action={submitTakeTemplate}>
            <input type="hidden" name="templateId" value={card.id} />
            <button
              type="submit"
              className={BTN_SECONDARY_CLASS}
              data-testid="template-take-alone"
            >
              {t("takeAlone")}
            </button>
          </form>
        </div>
      )}

      <div className={ACTIONS_CLASS}>
        <Link
          href={checklistPreviewPath(card.id)}
          className={BTN_GHOST_SM_CLASS}
          data-testid="template-preview"
        >
          {t("preview")}
        </Link>
        {canEdit ? (
          <Link
            href={checklistPath(card.id)}
            className={BTN_GHOST_SM_CLASS}
            data-testid="template-edit"
          >
            {t("edit")}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export async function TemplatesScreen(): Promise<ReactElement> {
  const t = await getTranslations("templates");
  const cards = await listTemplateCards();
  const canEdit = (await requireAdmin()).tenantKind === "hq";

  return (
    <AdminShell
      testId="templates-screen"
      active="templates"
      breadcrumb={t("breadcrumb")}
      title={t("title")}
      topbarAction={
        canEdit ? (
          <Link
            href={NEW_TEMPLATE_PATH}
            data-testid="new-template"
            className={BTN_PRIMARY_CLASS}
          >
            {t("new")}
          </Link>
        ) : null
      }
    >
      {/* D152 и D154: раздел объясняет себя сам — и тоном приглашения, а не приказа. */}
      <p className={INTRO_CLASS}>{t("intro")}</p>

      {cards.length === 0 ? (
        <div className={EMPTY_CLASS} data-testid="templates-empty">
          <p className="m-0">{t("empty")}</p>
        </div>
      ) : (
        <div className={GRID_CLASS} data-testid="template-list">
          {cards.map((card) => (
            <TemplateCardView key={card.id} card={card} canEdit={canEdit} />
          ))}
        </div>
      )}
    </AdminShell>
  );
}
