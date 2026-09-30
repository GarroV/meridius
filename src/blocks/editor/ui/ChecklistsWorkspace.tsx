import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import { AdminNav } from "@/blocks/core/ui/AdminNav";
import { MasterDetail } from "@/blocks/core/ui/MasterDetail";
import { SectionIntro } from "@/blocks/core/ui/SectionIntro";
import { requireAdmin } from "@/blocks/auth/guard";
import { scopeOf } from "@/blocks/auth/scope";

import { NO_FILTER } from "../filter";
import { buildFilterCatalog } from "../filter-options";
import { listChecklists, listStations } from "../listing";
import { CHECKLISTS_PATH } from "../routes";
import { listTemplateIds } from "../templates";
import { ChecklistRail } from "./ChecklistRail";

/**
 * Рабочее место раздела «Чек-листы» (D162): меню, колонка чек-листов и рабочая зона.
 * Рисуется разметкой сегмента, поэтому данные колонки читаются здесь один раз на
 * заход в раздел и заново — только когда действие редактора сбросило кэш раздела
 * (`revalidatePath(CHECKLISTS_PATH, "layout")` в `actions.ts`): переименованный или
 * опубликованный чек-лист тут же меняет свою строку.
 *
 * Список берётся целиком, а сужает его колонка (`rail-filter.ts`): параметры адреса
 * до разметки сегмента не доходят.
 */
export async function ChecklistsWorkspace({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactElement> {
  const viewer = await requireAdmin();
  const [rows, stations, templateIds, locale, messages, t] = await Promise.all([
    listChecklists(NO_FILTER, viewer),
    listStations(scopeOf(viewer)),
    listTemplateIds(),
    getLocale(),
    getMessages(),
    getTranslations("editor"),
  ]);

  return (
    <NextIntlClientProvider
      locale={locale}
      // Колонке нужен словарь редактора (числительные «4 пункта» склоняются на экране),
      // каркасу — подписи кабинета (ссылка-пропуск) и текст отказа границы ошибки.
      // Остальные разделы браузеру не нужны.
      messages={{
        editor: messages["editor"] as AbstractIntlMessages,
        admin: messages["admin"] as AbstractIntlMessages,
        failure: messages["failure"] as AbstractIntlMessages,
      }}
    >
      <MasterDetail
        testId="checklists-screen"
        nav={<AdminNav active="checklists" />}
        rail={
          <ChecklistRail rows={rows} catalog={buildFilterCatalog(stations)} />
        }
        railLabel={t("rail.label")}
        backHref={CHECKLISTS_PATH}
        backLabel={t("rail.back")}
        intro={<SectionIntro section="checklists" />}
        // Шаблон правится тем же редактором по адресу чек-листа (T309), но в список
        // чек-листов не входит: рядом с ним нет колонки, а меню подсвечивает «Шаблоны».
        wide={{
          segments: templateIds,
          nav: <AdminNav active="templates" />,
        }}
      >
        {children}
      </MasterDetail>
    </NextIntlClientProvider>
  );
}
