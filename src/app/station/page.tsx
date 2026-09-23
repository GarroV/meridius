import type { Metadata } from "next";

import { TabletScreen } from "@/blocks/device/ui/TabletScreen";

/**
 * Постоянный адрес привязанной вкладки: `/station`. В адресе НЕТ НИЧЕГО — ни кода
 * станции, ни пиццерии: вкладку закрепляют на планшете навсегда, а код станции
 * перевыпускается (D006) и закреплённая на нём вкладка после перевыпуска вела бы в отказ.
 *
 * Кто пришёл, говорит подписанная кука; что показать — живая строка устройства в базе.
 * Зависеть от блока входа этой странице запрещено правилом границ.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MERIDIUS",
  robots: { index: false, follow: false },
};

export default function StationTabletPage() {
  return <TabletScreen />;
}
