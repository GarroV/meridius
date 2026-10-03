import { getTranslations } from "next-intl/server";

import { LIMITS } from "../validation";
import type { NewChecklistLabels } from "./NewChecklistForm";

/**
 * Тексты формы заведения, переведённые на сервере: форма — клиентский компонент без
 * словаря (см. `NewChecklistForm.tsx`). Общие для «Нового чек-листа» и «Нового шаблона»:
 * форма одна, и два списка одних и тех же подписей разъехались бы бесшумно.
 */
export async function newChecklistLabels(): Promise<NewChecklistLabels> {
  const t = await getTranslations("editor");

  return {
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
    windowOwnFromShort: t("form.windowOwnFromShort"),
    windowOwnToShort: t("form.windowOwnToShort"),
    windowOwnHint: t("form.windowOwnHint"),
    create: t("form.create"),
    createTemplate: t("form.createTemplate"),
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
}
