import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { submitSignOut } from "@/blocks/auth/ui/sign-out-action";
import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { AdminShell } from "@/blocks/core/ui/AdminShell";

// Первый экран после входа. Ведёт в каждый готовый раздел — до этого здесь были только
// заголовок, строка «разделы появятся по мере готовности» и кнопка выхода, то есть вошедший
// упирался в тупик: разделы работали, но попасть в них можно было только зная адрес наизусть
// (#11). Вторая заглушка того же рода, что была на корне: заглушку сняли, а эту не заметили,
// потому что сквозные сценарии открывают экраны прямым `goto`.
//
// T112: экран идёт в общем каркасе, как и все остальные экраны кабинета. До этого он
// рисовался сам по себе — без меню и без верхней полосы, — и вошедший попадал на страницу,
// которая выглядит как другое приложение. Заметил это не сценарий, а глаз: перебор
// связности (`e2e/admin-nav.spec.ts`) идёт по РАЗДЕЛАМ, а главная разделом не является.
//
// Карточки разделов остаются и при меню, и это не дубль. Меню — это «куда уйти отсюда»
// одной строкой; карточка называет раздел вместе с тем, зачем в него идут («Напечатать
// наклейки станций»). Первому экрану после входа второе нужно: методист приходит сюда
// раз в неделю, а не живёт здесь.
//
// Порядок разделов — порядок работы методиста: завести чек-лист → напечатать коды →
// посмотреть заполнения → поправить справочник. Что готово, решает `core/admin-sections`.
const SECTIONS = [
  { key: "checklists", section: ADMIN_SECTIONS.checklists },
  { key: "library", section: ADMIN_SECTIONS.library },
  { key: "qr", section: ADMIN_SECTIONS.qr },
  { key: "feed", section: ADMIN_SECTIONS.feed },
  { key: "catalog", section: ADMIN_SECTIONS.catalog },
  { key: "devices", section: ADMIN_SECTIONS.devices },
] as const;

const CARD_CLASS =
  "bg-surface flex flex-col gap-[var(--space-2)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] py-[var(--space-5)] no-underline hover:border-[var(--accent)] hover:bg-[var(--surface-3)]";

const SIGN_OUT_CLASS =
  "bg-surface text-ink flex h-[var(--control-h)] items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-control-2)]";

export default async function AdminHomePage() {
  const t = await getTranslations("admin");

  return (
    <AdminShell
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
      narrow
    >
      {/* Метка `admin-home` осталась на содержимом, а не переехала на корень каркаса:
          по ней сценарии считают ссылки разделов, и на корне в этот счёт попало бы ещё
          и меню. */}
      <div
        data-testid="admin-home"
        className="flex flex-col gap-[var(--space-6)]"
      >
        <p className="text-ink-2 m-0 text-[length:var(--fs-body)]">
          {t("signedIn")}
        </p>

        <div className="flex flex-col gap-[var(--space-4)]">
          {SECTIONS.map(({ key, section }) => (
            <Link key={key} href={section.path} className={CARD_CLASS}>
              <span className="text-ink text-[length:var(--fs-lead)] font-medium">
                {t(`sections.${key}`)}
              </span>
              <span className="text-ink-2 text-[length:var(--fs-meta)] leading-[var(--lh-meta)]">
                {t(`sections.${key}Hint`)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
