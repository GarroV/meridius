import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AdminNav } from "@/blocks/core/ui/AdminNav";

import { loadEditor } from "../drafts";
import { listStations } from "../listing";
import { pickEditorText } from "../localized-text";
import { checklistPreviewPath } from "../routes";
import type { WindowValue } from "../window-field";
import { ChecklistEditor } from "./ChecklistEditor";

/** Время базы «06:00:00» на экране показывается и правится как «06:00». */
function toFormTime(value: string): string {
  return value.slice(0, 5);
}

function windowOf(start: string, end: string): WindowValue {
  return { start: toFormTime(start), end: toFormTime(end) };
}

/**
 * Экран редактора. Данные читаются на сервере одним заходом, дальше правка идёт в браузере
 * и уходит обратно двумя действиями — «сохранить черновик» и «опубликовать».
 *
 * Тексты редактора отдаются в браузер провайдером next-intl: клиентская часть большая
 * и с числительными («4 пункта», «используется ещё в 6 чек-листах»), а склонять их
 * пробросом готовых строк нельзя — количество меняется прямо на экране.
 */
export async function EditorScreen({ checklistId }: { checklistId: string }) {
  const state = await loadEditor(checklistId);
  if (state === null) notFound();

  const [locale, messages, stations, t] = await Promise.all([
    getLocale(),
    getMessages(),
    listStations(),
    getTranslations("editor"),
  ]);

  const highestVersion = state.versions.reduce(
    (highest, version) => Math.max(highest, version.versionNumber ?? 0),
    0,
  );

  const crumbs = [
    t("screen.crumbsRoot"),
    state.station?.countryName,
    state.station?.storeName,
    state.station?.name,
  ]
    .filter((part) => part !== undefined && part !== "")
    .join(" · ");

  return (
    <NextIntlClientProvider
      locale={locale}
      // Наружу уходит только словарь редактора: остальные разделы браузеру не нужны.
      messages={{ editor: messages["editor"] as AbstractIntlMessages }}
    >
      <div
        data-testid="editor-screen"
        className="grid min-h-screen grid-cols-[208px_1fr]"
      >
        <AdminNav active="checklists" />
        <ChecklistEditor
          checklistId={checklistId}
          locale={locale}
          initialTitle={pickEditorText(state.checklist.title, locale)}
          initialStationId={state.checklist.stationId ?? ""}
          initialWindow={windowOf(
            state.checklist.windowStart,
            state.checklist.windowEnd,
          )}
          initialSections={state.sections}
          stations={stations}
          station={state.station}
          versions={state.versions}
          library={state.library}
          nextVersionNumber={highestVersion + 1}
          previewHref={checklistPreviewPath(checklistId)}
          crumbs={crumbs}
        />
      </div>
    </NextIntlClientProvider>
  );
}
