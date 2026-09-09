import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { submitSignOut } from "@/blocks/auth/ui/sign-out-action";
import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

// Первый экран после входа. Ведёт в каждый готовый раздел — до этого здесь были только
// заголовок, строка «разделы появятся по мере готовности» и кнопка выхода, то есть вошедший
// упирался в тупик: разделы работали, но попасть в них можно было только зная адрес наизусть
// (#11). Вторая заглушка того же рода, что была на корне: заглушку сняли, а эту не заметили,
// потому что сквозные сценарии открывают экраны прямым `goto`.
//
// Порядок разделов — порядок работы методиста: завести чек-лист → напечатать коды →
// посмотреть заполнения → поправить справочник. Что готово, решает `core/admin-sections`.
const SECTIONS = [
  { key: "checklists", section: ADMIN_SECTIONS.checklists },
  { key: "library", section: ADMIN_SECTIONS.library },
  { key: "qr", section: ADMIN_SECTIONS.qr },
  { key: "feed", section: ADMIN_SECTIONS.feed },
  { key: "catalog", section: ADMIN_SECTIONS.catalog },
] as const;

const CARD_CLASS =
  "bg-surface flex flex-col gap-[var(--space-2)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] py-[var(--space-5)] no-underline hover:border-[var(--accent)] hover:bg-[var(--surface-3)]";

export default async function AdminHomePage() {
  const t = await getTranslations("admin");

  return (
    <main
      data-testid="admin-home"
      className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-[var(--space-6)] p-[var(--space-9)]"
    >
      <h1 className="text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold">
        {t("home")}
      </h1>
      <p className="text-ink-2 text-[length:var(--fs-body)]">{t("signedIn")}</p>

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

      <form action={submitSignOut}>
        <button
          type="submit"
          data-testid="sign-out"
          className="bg-surface text-ink flex h-[var(--control-h)] items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-control-2)]"
        >
          {t("signOut")}
        </button>
      </form>
    </main>
  );
}
