import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { AdminPage } from "@/blocks/core/ui/AdminPage";
import { SectionIntro } from "@/blocks/core/ui/SectionIntro";

import { NEW_CHECKLIST_PATH } from "../routes";

/**
 * Рабочая зона раздела «Чек-листы», пока ничего не выбрано (D162): вводный блок раздела
 * и кнопка нового чек-листа.
 */

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
      {/* D172: пояснение у раздела одно — вводный блок; строки «Выберите … слева» сняты,
          кнопка осталась. */}
      <div data-testid="checklists-pick">
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
