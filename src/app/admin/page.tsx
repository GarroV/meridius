import { getLocale, getTranslations } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import { submitSignOut } from "@/blocks/auth/ui/sign-out-action";
import type { Locale } from "@/blocks/core/locale";
import { AdminShell } from "@/blocks/core/ui/AdminShell";
import { loadHome } from "@/blocks/home/load";
import { HomeScreen } from "@/blocks/home/ui/HomeScreen";

// D189: спокойный обзор пиццерий на сегодня; история и подробности — в статистике.

const SIGN_OUT_CLASS =
  "bg-surface text-ink flex h-[var(--control-h)] max-md:h-[var(--tap-min)] items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-control-2)]";

/**
 * `requireAdmin()` зовётся здесь, а не только в разметке `src/app/admin/layout.tsx`:
 * разметка и страница рендерятся параллельно, и без этой строки главная успела бы
 * сходить в базу до того, как охрана уведёт гостя на вход.
 */
export default async function AdminHomePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ country?: string }>;
}) {
  const viewer = await requireAdmin();

  const t = await getTranslations("admin");
  const locale = (await getLocale()) as Locale;
  const model = await loadHome(locale, viewer, (await searchParams).country);

  return (
    <AdminShell
      active="home"
      testId="admin-home-screen"
      // Раздел не выбран намеренно: главная — единственный экран кабинета, который
      // не является разделом, и подсвечивать в меню ей нечего.
      title={t("home")}
      // Партнёр видит, чья это зона: его название и его страны. У УК — вся сеть.
      breadcrumb={
        model.owner === null
          ? undefined
          : `${model.owner.name} · ${model.owner.countries.join(", ")}`
      }
      topbarAction={
        <form action={submitSignOut}>
          <button
            type="submit"
            data-testid="sign-out"
            className={SIGN_OUT_CLASS}
          >
            {t("signOut")}
          </button>
        </form>
      }
    >
      <HomeScreen model={model} />
    </AdminShell>
  );
}
