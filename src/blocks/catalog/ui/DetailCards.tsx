import { getLocale, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { Locale } from "@/blocks/core/locale";

import { CountryCard } from "./CountryCard";
import type { CatalogModel } from "./model";
import { StationCard } from "./StationCard";
import { StoreCard } from "./StoreCard";

/**
 * Какую карточку правки показать под деревом — страна, пиццерия или станция —
 * решает фокус дерева (`model.focus`). Сами карточки лежат рядом, по файлу на
 * сущность (`CountryCard.tsx`, `StoreCard.tsx`, `StationCard.tsx`), общее
 * оформление и имена полей форм — в `detail-card-kit.ts`.
 *
 * Эталон `docs/furca/design/screens/catalog.html` фиксирует только состояние
 * «пиццерия выбрана»; страна и станция держатся того же визуального языка.
 *
 * Карточки подтверждения удаления — в `CatalogScreen.tsx`: это отдельный режим
 * экрана, а не карточка правки.
 */
export async function DetailCards({
  model,
}: {
  readonly model: CatalogModel;
}): Promise<ReactElement | null> {
  const t = await getTranslations("catalog");
  const locale = (await getLocale()) as Locale;
  const { focus, countryId, storeId, stationId, country, store, station } =
    model;

  if (focus === "store" && store !== null && countryId !== null) {
    return (
      <StoreCard
        store={store}
        countryId={countryId}
        timezones={model.timezones}
        t={t}
      />
    );
  }
  if (focus === "country" && country !== null) {
    return <CountryCard country={country} t={t} />;
  }
  if (
    focus === "station" &&
    station !== null &&
    countryId !== null &&
    storeId !== null &&
    stationId !== null
  ) {
    return (
      <StationCard
        station={station}
        countryId={countryId}
        storeId={storeId}
        stationId={stationId}
        freeChecklists={model.freeChecklists}
        locale={locale}
        t={t}
      />
    );
  }
  return null;
}
