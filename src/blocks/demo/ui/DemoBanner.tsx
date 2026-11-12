import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { DEMO_PATH, isDemoMode } from "@/blocks/core/demo-mode";

/** Посадочная (D193): из кабинета демо туда есть путь, а не только наружу. */
const WELCOME_PATH = "/welcome";

/** Плашка демо-режима (D193): данные сбрасываются каждый час, роль меняют на `/demo`. Вне демо — ничего. */
export async function DemoBanner() {
  if (!isDemoMode()) return null;
  const t = await getTranslations("demo.banner");
  return (
    <div
      data-testid="demo-banner"
      className="demo-banner flex flex-wrap items-center justify-center gap-x-[var(--space-4)] bg-[var(--accent-soft)] px-[var(--space-5)] py-[var(--space-3)] text-[length:var(--fs-meta)] text-[var(--ink)]"
    >
      <span>{t("text")}</span>
      <span aria-hidden="true">·</span>
      <Link href={DEMO_PATH} className="font-semibold underline">
        {t("switch")}
      </Link>
      <span aria-hidden="true">·</span>
      <Link
        href={WELCOME_PATH}
        className="font-semibold underline"
        data-testid="demo-about"
      >
        {t("about")}
      </Link>
    </div>
  );
}
