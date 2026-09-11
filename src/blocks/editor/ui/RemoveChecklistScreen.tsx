import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { AdminShell } from "@/blocks/core/ui/AdminShell";
import type { LocalizedText } from "@/blocks/data";

import { submitDeleteChecklist } from "../actions";
import { previewRemoval } from "../removal";
import { CHECKLISTS_PATH } from "../routes";
import { EditorInputError } from "../validation";

/**
 * Подтверждение удаления чек-листа.
 *
 * Отдельный экран, а не всплывающее «вы уверены?»: последствие зависит от истории и его надо
 * назвать заранее. Чек-лист без заполнений стирается целиком; чек-лист, по которому уже
 * заполняли, стереть нельзя — в заполнениях хранится то, что видел сотрудник (принцип 3,
 * D002), — и он уходит из работы, сохраняя историю. Кнопка называется тем, что произойдёт.
 *
 * Работает без JavaScript, как и остальные формы продукта.
 */

const CARD_CLASS =
  "bg-surface flex max-w-2xl flex-col gap-[var(--space-6)] rounded-[var(--r-block)] border border-[var(--line-strong)] p-[var(--space-8)] shadow-[var(--sh-xs)]";
const BTN_DANGER_CLASS =
  "inline-flex h-[var(--control-h)] items-center justify-center rounded-[var(--r-control)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-err hover:border-[var(--err)]";
const BTN_GHOST_CLASS =
  "inline-flex h-[var(--control-h)] items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] bg-transparent px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";

/** Название на языке интерфейса; если его нет — первое, что есть (черновик мог начаться на другом). */
function pickText(text: LocalizedText, locale: string): string {
  return text[locale] ?? Object.values(text)[0] ?? "";
}

export async function RemoveChecklistScreen({
  id,
}: {
  readonly id: string;
}): Promise<ReactElement> {
  const preview = await (async () => {
    try {
      return await previewRemoval(id);
    } catch (error) {
      // Нечитаемый или чужой идентификатор — 404, а не пустой экран подтверждения:
      // кнопка «Удалить» на экране, который не знает, что удаляет, хуже отсутствия кнопки.
      if (error instanceof EditorInputError) notFound();
      throw error;
    }
  })();

  const locale = await getLocale();
  const t = await getTranslations("editor");

  const willArchive = preview.outcome === "archived";
  const explanation = preview.archived
    ? t("remove.alreadyArchived")
    : willArchive
      ? t("remove.willArchive", { count: preview.submissionCount })
      : t("remove.willDelete");

  return (
    <AdminShell
      testId="remove-checklist-screen"
      active="checklists"
      breadcrumb={t("remove.crumbs")}
      title={t("remove.title")}
      topbarAction={null}
    >
      <div className={CARD_CLASS}>
        <div className="flex flex-col gap-[var(--space-2)]">
          <span className="text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase">
            {t("remove.name")}
          </span>
          <span
            data-testid="remove-checklist-title"
            className="text-ink text-[length:var(--fs-lead)] font-medium"
          >
            {pickText(preview.title, locale)}
          </span>
        </div>

        <p
          data-testid="remove-checklist-explanation"
          className="text-ink-2 m-0 text-[length:var(--fs-body)] leading-[var(--lh-body)]"
        >
          {explanation}
        </p>

        <div className="flex items-center gap-[var(--space-5)]">
          <form action={submitDeleteChecklist}>
            <input type="hidden" name="checklistId" value={id} />
            <button
              type="submit"
              data-testid="remove-checklist-confirm"
              className={BTN_DANGER_CLASS}
            >
              {willArchive
                ? t("remove.confirmArchive")
                : t("remove.confirmDelete")}
            </button>
          </form>
          <Link href={CHECKLISTS_PATH} className={BTN_GHOST_CLASS}>
            {t("remove.cancel")}
          </Link>
        </div>
      </div>
    </AdminShell>
  );
}
