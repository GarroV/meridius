import { getLocale, getTranslations } from "next-intl/server";

import { AdminShell } from "@/blocks/core/ui/AdminShell";
import { NewChecklistForm } from "@/blocks/editor/ui/NewChecklistForm";
import { newChecklistLabels } from "@/blocks/editor/ui/new-checklist-labels";
import { requireHq } from "@/blocks/auth/guard";

/**
 * Заведение шаблона (T309): та же форма, что у чек-листа, но без станции — у шаблона
 * её не бывает (D154). Дальше шаблон правится в том же редакторе.
 */
export default async function NewTemplatePage() {
  // Шаблоны заводит УК (D149); партнёру этого адреса нет.
  await requireHq();
  const t = await getTranslations("templates");
  const locale = await getLocale();
  const labels = await newChecklistLabels();

  return (
    <AdminShell
      testId="new-template-screen"
      active="templates"
      breadcrumb={t("title")}
      title={t("new")}
      topbarAction={null}
    >
      <NewChecklistForm
        stations={[]}
        locale={locale}
        labels={labels}
        kind="template"
      />
    </AdminShell>
  );
}
