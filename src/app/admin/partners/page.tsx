import { getLocale } from "next-intl/server";

import { requireHq } from "@/blocks/auth/guard";
import {
  listCountryNames,
  listPartnerAccounts,
  listPartnerTenantNames,
} from "@/blocks/auth/partners";
import { PartnersScreen } from "@/blocks/auth/ui/PartnersScreen";

/**
 * Экран УК «Партнёры» (T337). `requireHq()` — здесь, а не только в разметке: разметка и
 * страница рендерятся параллельно, и без этой строки страница успела бы сходить в базу.
 * Партнёру адрес отвечает 404, как несуществующий.
 */
export default async function PartnersPage() {
  await requireHq();

  const [accounts, tenantNames, countryNames, locale] = await Promise.all([
    listPartnerAccounts(),
    listPartnerTenantNames(),
    listCountryNames(),
    getLocale(),
  ]);

  return (
    <PartnersScreen
      model={{ accounts, tenantNames, countryNames }}
      locale={locale}
    />
  );
}
