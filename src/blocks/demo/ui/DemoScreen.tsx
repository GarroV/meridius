import { getTranslations } from "next-intl/server";

import { formActionPath } from "@/blocks/core/base-path";
import { PUBLIC_FILL_PREFIX } from "@/blocks/core/public-routes";
import { BrandLogo } from "@/blocks/core/ui/BrandLogo";

import { DEMO_ROLES, KITCHEN_STATION_CODE } from "../roles";

const CARD_CLASS =
  "bg-surface flex flex-col gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line-strong)] p-[var(--space-8)] shadow-[var(--sh-xs)]";
const BUTTON_BASE_CLASS =
  "mt-auto flex h-[var(--tap-min)] w-full cursor-pointer items-center justify-center rounded-[var(--r-control)] border text-[length:var(--fs-body)] font-medium";
// Главная кнопка одна, на роли, с которой стоит начать; остальные тише, чтобы четыре
// равные синие «Открыть» не оставляли человека гадать, куда нажать первым.
const BUTTON_PRIMARY_CLASS = `${BUTTON_BASE_CLASS} bg-accent border-[var(--accent)] text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]`;
const BUTTON_QUIET_CLASS = `${BUTTON_BASE_CLASS} bg-surface border-[var(--line-control)] text-ink hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]`;
const START_TAG_CLASS =
  "bg-[var(--accent-soft)] w-fit rounded-[var(--r-mark)] border border-[var(--accent-line)] px-[var(--space-4)] py-[1px] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--accent)] uppercase";
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
        <BrandLogo className="mb-[var(--space-3)] h-[44px] w-[44px] rounded-[var(--r-block)]" />
        <h1 className="m-0 text-[length:var(--fs-display)] leading-[var(--lh-display)] font-semibold">
          {t("title")}
        </h1>
        <p className={TEXT_CLASS}>{t("lead")}</p>
      </header>

      <p className={`${TEXT_CLASS} -mb-[var(--space-4)]`}>{t("startNote")}</p>

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
            className={`${CARD_CLASS}${role.kind === "hq" ? " border-[var(--accent)]" : ""}`}
          >
            <input type="hidden" name="role" value={role.key} />
            {role.kind === "hq" ? (
              <span className={START_TAG_CLASS}>{t("start")}</span>
            ) : null}
            <h2 className={TITLE_CLASS}>
              {role.kind === "hq"
                ? t("hq.title")
                : t("partner.title", { name: role.partnerName ?? "" })}
            </h2>
            <p className={TEXT_CLASS}>
              {role.kind === "hq"
                ? t("hq.text")
                : role.key === "partner-sunrise"
                  ? t("partner.textSunrise")
                  : t("partner.textLakeside")}
            </p>
            <button
              type="submit"
              className={
                role.kind === "hq" ? BUTTON_PRIMARY_CLASS : BUTTON_QUIET_CLASS
              }
            >
              {role.kind === "hq" ? t("enterHq") : t("enterPartner")}
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
          <button type="submit" className={BUTTON_QUIET_CLASS}>
            {t("enterKitchen")}
          </button>
        </form>
      </section>
    </main>
  );
}
