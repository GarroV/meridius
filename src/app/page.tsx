import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ADMIN_HOME } from "@/blocks/core/admin-sections";

// Входная точка продукта. Держит два обещания: показывает язык, выбранный по настройке
// браузера (без cookie — сценарий кухни, e2e/locale.spec.ts), и ведёт в рабочий кабинет.
// Без ссылки корень был заглушкой каркаса: адрес открывался, а попасть в продукт с него
// было нельзя — нужно было знать путь /admin наизусть.
export default async function HomePage() {
  const t = await getTranslations("home");
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-[var(--space-5)] p-[var(--space-8)]">
      <h1
        className="text-accent text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold"
        data-testid="title"
      >
        {t("title")}
      </h1>
      <p className="text-ink-2" data-testid="subtitle">
        {t("subtitle")}
      </p>
      <Link
        href={ADMIN_HOME.path}
        data-testid="enter"
        className="bg-accent flex h-[var(--control-h)] w-fit items-center justify-center rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]"
      >
        {t("enter")}
      </Link>
    </main>
  );
}
