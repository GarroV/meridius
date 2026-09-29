import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import { AdminNav } from "@/blocks/core/ui/AdminNav";
import { MasterDetail } from "@/blocks/core/ui/MasterDetail";
import { requireAdmin } from "@/blocks/auth/guard";
import { scopeOf } from "@/blocks/auth/scope";

import { countGaps, listNetworkStations } from "../overview";
import { StationsRail, type StationRailRow } from "./StationsRail";
import { STATIONS_PATH } from "./view";

/**
 * Рабочее место раздела «Станции» (D163): меню, колонка станций и карточка выбранной.
 * Рисуется разметкой сегмента: колонка читается один раз на заход в раздел и заново —
 * когда действие карточки или раскатка сбросили кэш раздела (`actions.ts`), поэтому
 * привязанный чек-лист тут же снимает со строки метку «Нет чек-листа».
 */
export async function StationsWorkspace({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactElement> {
  const viewer = await requireAdmin();
  const [stations, locale, messages, t] = await Promise.all([
    listNetworkStations(scopeOf(viewer)),
    getLocale(),
    getMessages(),
    getTranslations("stations"),
  ]);

  // В браузер — только то, что строка показывает: код станции и время последнего
  // заполнения колонке не нужны.
  const rows: StationRailRow[] = stations.map((station) => ({
    id: station.id,
    name: station.name,
    storeId: station.storeId,
    storeName: station.storeName,
    countryId: station.countryId,
    countryName: station.countryName,
    checklistCount: station.checklistCount,
    deviceCount: station.deviceCount,
    gaps: station.gaps,
  }));

  return (
    <NextIntlClientProvider
      locale={locale}
      // Колонке — словарь раздела (числительные «2 чек-листа»), каркасу — подписи
      // кабинета и текст отказа границы ошибки. Остальное браузеру не нужно.
      messages={{
        stations: messages["stations"] as AbstractIntlMessages,
        admin: messages["admin"] as AbstractIntlMessages,
        failure: messages["failure"] as AbstractIntlMessages,
      }}
    >
      <MasterDetail
        testId="stations-screen"
        nav={<AdminNav active="stations" />}
        rail={<StationsRail rows={rows} counts={countGaps(stations)} />}
        railLabel={t("rail.label")}
        backHref={STATIONS_PATH}
        backLabel={t("rail.back")}
      >
        {children}
      </MasterDetail>
    </NextIntlClientProvider>
  );
}
