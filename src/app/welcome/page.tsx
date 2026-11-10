import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { asLocale } from "@/blocks/core/locale";
import { LandingPage } from "@/blocks/landing/LandingPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("welcome");
  return { title: t("title"), description: t("description") };
}

// Посадочная для того, кто пришёл без входа (D193): что за продукт и две двери — демо и
// вход. Язык — тот же, что у остального продукта (кука выбора, затем язык браузера);
// явный `?lang=` превращает посредник (`src/proxy.ts`) в ту же куку.
export default async function WelcomePage() {
  return <LandingPage locale={asLocale(await getLocale())} />;
}
