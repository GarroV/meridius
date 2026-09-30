import { getLocale, getTranslations } from "next-intl/server";

import { AdminPage } from "@/blocks/core/ui/AdminPage";
import { listStations } from "@/blocks/editor/listing";
import { NewChecklistForm } from "@/blocks/editor/ui/NewChecklistForm";
import { newChecklistLabels } from "@/blocks/editor/ui/new-checklist-labels";
import { requireAdmin } from "@/blocks/auth/guard";
import { scopeOf } from "@/blocks/auth/scope";

/**
 * Экран заведения чек-листа. Форма — клиентский компонент без доступа к словарю
 * next-intl, поэтому все тексты, включая тексты отказов с уже подставленным пределом
 * (`{limit}`), переводятся на сервере и уходят одним пропом `labels`
 * (см. `new-checklist-labels.ts`).
 *
 * Меню и колонку чек-листов рисует разметка раздела (D162): форма заведения встаёт в
 * рабочую зону справа, список остаётся на месте.
 */
export default async function NewChecklistPage() {
  const t = await getTranslations("editor");
  const stations = await listStations(scopeOf(await requireAdmin()));
  const locale = await getLocale();
  const labels = await newChecklistLabels();

  return (
    <AdminPage
      testId="new-checklist-screen"
      breadcrumb={t("list.title")}
      title={t("form.create")}
      topbarAction={null}
    >
      <NewChecklistForm stations={stations} locale={locale} labels={labels} />
    </AdminPage>
  );
}
