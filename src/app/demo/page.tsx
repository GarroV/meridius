import { getLocale } from "next-intl/server";

import { requireDemo } from "@/blocks/core/demo-gate";
import { asLocale } from "@/blocks/core/locale";
import { DemoScreen } from "@/blocks/demo/ui/DemoScreen";
import { LandingBar } from "@/blocks/landing/LandingBar";

// Выбор роли открытого демо (D193). Без DEMO_MODE=1 адреса нет вовсе: прод ведёт себя как прежде.
export const dynamic = "force-dynamic";

// Шапка та же, что у посадочной (логотип → `/welcome`, язык), и страница в её светлой
// оболочке `.lp`: два публичных экрана выглядят одним продуктом, а с демо есть путь назад.
export default async function DemoPage() {
  requireDemo();
  return (
    <div className="lp">
      <LandingBar locale={asLocale(await getLocale())} />
      <DemoScreen />
    </div>
  );
}
