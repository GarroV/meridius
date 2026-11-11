import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { isDemoMode } from "@/blocks/auth/config";
import { formActionPath } from "@/blocks/core/base-path";
import { DEMO_PATH, DEMO_ROLES } from "@/blocks/core/demo";
import { asLocale } from "@/blocks/core/locale";
import { LocaleToggle } from "@/blocks/core/ui/LocaleToggle";

// Флаг читается на каждый запрос, а не на сборке: без `force-dynamic` Next отрисовал бы
// страницу один раз при сборке, когда `DEMO_MODE` ещё не задан, и запёк бы 404 навсегда.
export const dynamic = "force-dynamic";

const CARD_CLASS =
  "bg-surface flex flex-col gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line-strong)] p-[var(--space-8)] shadow-[var(--sh-xs)]";
const BUTTON_CLASS =
  "bg-accent flex h-[var(--control-h)] w-full cursor-pointer items-center justify-center rounded-[var(--r-control)] border border-[var(--accent)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]";

/**
 * Открытый вход в демо: выбор роли, пароля нет (D194). Только при `DEMO_MODE=1`; без
 * флага адреса нет вовсе — 404, как на любой несуществующий.
 *
 * Кнопка — обычная форма `POST /demo/<роль>`: обработчик маршрута, а не серверное
 * действие (кука сессии ставится вне файлов «use server», см. `auth/session-cookie.ts`).
 */
export default async function DemoEntryPage(): Promise<ReactElement> {
  if (!isDemoMode()) notFound();

  const t = await getTranslations("demo");
  const tAdmin = await getTranslations("admin");
  const locale = asLocale(await getLocale());

  return (
    <main
      data-testid="demo-entry"
      className="flex min-h-screen items-center justify-center p-[var(--space-8)]"
    >
      <div className="flex w-[480px] max-w-full flex-col gap-[var(--space-7)]">
        <p className="m-0 text-center text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold">
          {t("title")}
        </p>
        <p className="m-0 text-center text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-2)]">
          {t("lead")}
        </p>
        {DEMO_ROLES.map((role) => (
          <form
            key={role.key}
            method="post"
            action={formActionPath(`${DEMO_PATH}/${role.key}`)}
            data-testid={`demo-role-${role.key}`}
            className={CARD_CLASS}
          >
            <h2 className="m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold">
              {t(`roles.${role.key}.title`)}
            </h2>
            <p className="m-0 text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-2)]">
              {t(`roles.${role.key}.note`)}
            </p>
            <button type="submit" className={BUTTON_CLASS}>
              {t("enter", { role: t(`roles.${role.key}.title`) })}
            </button>
          </form>
        ))}
        <LocaleToggle current={locale} label={tAdmin("locale.label")} />
      </div>
    </main>
  );
}
