import { getLocale, getTranslations } from "next-intl/server";

import { AdminShell } from "@/blocks/core/ui/AdminShell";
import { listStations } from "@/blocks/editor/listing";
import { NewChecklistForm } from "@/blocks/editor/ui/NewChecklistForm";
import { newChecklistLabels } from "@/blocks/editor/ui/new-checklist-labels";

/**
 * Экран заведения чек-листа. Форма — клиентский компонент без доступа к словарю
 * next-intl, поэтому все тексты, включая тексты отказов с уже подставленным пределом
 * (`{limit}`), переводятся на сервере и уходят одним пропом `labels`
 * (см. `new-checklist-labels.ts`).
 */
export default async function NewChecklistPage() {
  const t = await getTranslations("editor");
  const stations = await listStations();
  const locale = await getLocale();
  const labels = await newChecklistLabels();

  return (
    <AdminShell
      testId="new-checklist-screen"
      active="checklists"
      breadcrumb={t("list.title")}
      title={t("form.create")}
      topbarAction={null}
    >
      <NewChecklistForm stations={stations} locale={locale} labels={labels} />
    </AdminShell>
  );
}
