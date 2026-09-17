import { getLocale, getTranslations } from "next-intl/server";

import { AdminShell } from "@/blocks/core/ui/AdminShell";
import { listStations } from "@/blocks/editor/listing";
import type { NewChecklistLabels } from "@/blocks/editor/ui/NewChecklistForm";
import { NewChecklistForm } from "@/blocks/editor/ui/NewChecklistForm";
import { LIMITS } from "@/blocks/editor/validation";

/**
 * Экран заведения чек-листа (T0хх). Форма — клиентский компонент без доступа к
 * словарю next-intl, поэтому все тексты, включая тексты отказов с уже подставленным
 * пределом (`{limit}`), переводятся здесь и уходят одним пропом `labels`
 * (см. комментарий в `NewChecklistForm.tsx`).
 */
export default async function NewChecklistPage() {
  const t = await getTranslations("editor");
  const stations = await listStations();
  const locale = await getLocale();

  const labels: NewChecklistLabels = {
    title: t("form.title"),
    titlePlaceholder: t("form.titlePlaceholder"),
    station: t("form.station"),
    noStation: t("form.noStation"),
    window: t("form.window"),
    windowMorning: t("form.windowMorning"),
    windowEvening: t("form.windowEvening"),
    windowAny: t("form.windowAny"),
    windowOwn: t("form.windowOwn"),
    windowOwnFrom: t("form.windowOwnFrom"),
    windowOwnTo: t("form.windowOwnTo"),
    windowOwnHint: t("form.windowOwnHint"),
    create: t("form.create"),
    cancel: t("form.cancel"),
    errors: {
      badFormat: t("errors.badFormat"),
      tooManySections: t("errors.tooManySections", { limit: LIMITS.sections }),
      tooManyItems: t("errors.tooManyItems", { limit: LIMITS.items }),
      textTooLong: t("errors.textTooLong", { limit: LIMITS.textLength }),
      emptyWindow: t("errors.emptyWindow"),
      emptyTitle: t("errors.emptyTitle"),
      notFound: t("errors.notFound"),
      unknown: t("errors.unknown"),
    },
  };

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
