import { getLocale, getTranslations } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import { submitSignOut } from "@/blocks/auth/ui/sign-out-action";
import type { Locale } from "@/blocks/core/locale";
import { AdminShell } from "@/blocks/core/ui/AdminShell";
import { loadHome } from "@/blocks/home/load";
import { HomeScreen } from "@/blocks/home/ui/HomeScreen";

// Первый экран после входа — «что требует внимания» (D183): тревоги, что не закрыто и
// свои чек-листы. До D174 здесь стояли карточки-ссылки на разделы (#11, T112), с D174 —
// пульт сети с цифрами за период; D183 снял и цифры: у одного числа одно место —
// «Статистика», главная ведёт туда ссылкой.
//
// T112 остаётся в силе: экран идёт в общем каркасе, как и все остальные экраны кабинета.

const SIGN_OUT_CLASS =
  "bg-surface text-ink flex h-[var(--control-h)] items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-control-2)]";

/**
 * `requireAdmin()` зовётся здесь, а не только в разметке `src/app/admin/layout.tsx`:
 * разметка и страница рендерятся параллельно, и без этой строки главная успела бы
 * сходить в базу до того, как охрана уведёт гостя на вход.
 */
export default async function AdminHomePage() {
  const viewer = await requireAdmin();

  const t = await getTranslations("admin");
  const locale = (await getLocale()) as Locale;
  const model = await loadHome(locale, viewer);

  return (
    <AdminShell
      active="home"
      testId="admin-home-screen"
      // Раздел не выбран намеренно: главная — единственный экран кабинета, который
      // не является разделом, и подсвечивать в меню ей нечего.
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
      <HomeScreen model={model} />
    </AdminShell>
  );
}
