import { getTranslations } from "next-intl/server";

import { formActionPath } from "@/blocks/core/base-path";
import { PUBLIC_FILL_PREFIX } from "@/blocks/core/public-routes";

import { DEMO_ROLES, KITCHEN_STATION_CODE } from "../roles";

const CARD_CLASS =
  "bg-surface flex flex-col gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line-strong)] p-[var(--space-8)] shadow-[var(--sh-xs)]";
const BUTTON_CLASS =
  "bg-accent mt-auto flex h-[var(--control-h)] w-full cursor-pointer items-center justify-center rounded-[var(--r-control)] border border-[var(--accent)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]";
const TITLE_CLASS =
  "m-0 text-[length:var(--fs-lead)] leading-[var(--lh-title)] font-semibold";
const TEXT_CLASS =
  "m-0 text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-2)]";

/** Экран выбора роли: УК и партнёры входят POST-формой, кухня — обычной ссылкой на станцию. */
export async function DemoScreen() {
  const t = await getTranslations("demo.page");

  return (
    <main
      data-testid="demo-screen"
      className="mx-auto flex w-[960px] max-w-full flex-col gap-[var(--space-8)] px-[var(--space-8)] pt-[var(--space-10)] pb-[var(--space-10)]"
    >
      <header className="flex flex-col gap-[var(--space-3)]">
        <h1 className="m-0 text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold">
          {t("title")}
        </h1>
        <p className={TEXT_CLASS}>{t("lead")}</p>
      </header>

      <section
        aria-label={t("roles")}
        className="grid gap-[var(--space-6)] md:grid-cols-2"
      >
        {DEMO_ROLES.map((role) => (
          <form
            key={role.key}
            method="post"
            action={formActionPath("/demo/enter")}
            data-testid={`demo-role-${role.key}`}
            className={CARD_CLASS}
          >
            <input type="hidden" name="role" value={role.key} />
            <h2 className={TITLE_CLASS}>
              {role.kind === "hq"
                ? t("hq.title")
                : t("partner.title", { name: role.partnerName ?? "" })}
            </h2>
            <p className={TEXT_CLASS}>
              {role.kind === "hq" ? t("hq.text") : t("partner.text")}
            </p>
            <button type="submit" className={BUTTON_CLASS}>
              {t("enter")}
            </button>
          </form>
        ))}

        {/* Обычная GET-форма, а не <Link>: экран заполнения живёт под своей политикой
            безопасности (`src/proxy.ts`), и ему нужна настоящая навигация, а не клиентская. */}
        <form
          method="get"
          action={formActionPath(
            `${PUBLIC_FILL_PREFIX}${KITCHEN_STATION_CODE}`,
          )}
          data-testid="demo-role-kitchen"
          className={CARD_CLASS}
        >
          <h2 className={TITLE_CLASS}>{t("kitchen.title")}</h2>
          <p className={TEXT_CLASS}>{t("kitchen.text")}</p>
          <button type="submit" className={BUTTON_CLASS}>
            {t("enter")}
          </button>
        </form>
      </section>
    </main>
  );
}
