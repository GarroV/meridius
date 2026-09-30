import { getLocale, getTranslations } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import { submitSignOut } from "@/blocks/auth/ui/sign-out-action";
import type { Locale } from "@/blocks/core/locale";
import { AdminShell } from "@/blocks/core/ui/AdminShell";
import type { SearchParams } from "@/blocks/feed/view";
import { loadHome } from "@/blocks/home/load";
import { HomeScreen } from "@/blocks/home/ui/HomeScreen";
import { parseHomeView } from "@/blocks/home/view";

// Первый экран после входа — пульт сети (D174): цифры, дырки и станции выбранной
// области. До D174 здесь стояли карточки-ссылки на разделы (#11, T112); владелец снял их
// вопросом «смысл что она показывает ссылки на другие разделы?» — меню слева и так ведёт
// в каждый раздел, а главная обязана отвечать, что в сети происходит. «Мои чек-листы»
// прежней главной (D148, T315) живут на пульте блоком, в той же области видимости
// вошедшего (D145).
//
// T112 остаётся в силе: экран идёт в общем каркасе, как и все остальные экраны кабинета.

const SIGN_OUT_CLASS =
  "bg-surface text-ink flex h-[var(--control-h)] items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-control-2)]";

/**
 * `requireAdmin()` зовётся здесь, а не только в разметке `src/app/admin/layout.tsx`:
 * разметка и страница рендерятся параллельно, и без этой строки главная успела бы
 * сходить в базу до того, как охрана уведёт гостя на вход.
 */
export default async function AdminHomePage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const viewer = await requireAdmin();

  const t = await getTranslations("admin");
  const view = parseHomeView(await searchParams);
  const locale = (await getLocale()) as Locale;
  const now = new Date();
  const model = await loadHome(view, locale, viewer, now);

  return (
    <AdminShell
      active="home"
      testId="admin-home-screen"
      // Раздел не выбран намеренно: главная — единственный экран кабинета, который
      // не является разделом, и подсвечивать в меню ей нечего.
      breadcrumb={t("crumbs")}
      title={t("home")}
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
      <HomeScreen model={model} view={view} now={now} locale={locale} />
    </AdminShell>
  );
}
