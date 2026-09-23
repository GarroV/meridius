import type { Metadata } from "next";

import { PairScreen } from "@/blocks/device/ui/PairScreen";

/**
 * Адрес привязки планшета: `/pair`. Набирается на планшете руками один раз в жизни —
 * поэтому короткий и без параметров.
 *
 * Публичный: до ввода пина продукт о планшете не знает ничего, а сотруднику с кухни
 * пароль кабинета взять негде (T187). Зависеть от блока входа этой странице запрещено
 * правилом границ (`tablet-route-has-no-auth`).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MERIDIUS",
  // Адрес привязки не должен попадать в поисковую выдачу.
  robots: { index: false, follow: false },
};

export default function PairPage() {
  return <PairScreen />;
}
