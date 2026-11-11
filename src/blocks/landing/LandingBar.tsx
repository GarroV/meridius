import type { StaticImageData } from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import brandMarkFile from "@/blocks/core/brand/mark-small.svg";
import type { Locale } from "@/blocks/core/locale";
import { LocaleToggle } from "@/blocks/core/ui/LocaleToggle";

import "./landing.css";

const brandMark = brandMarkFile as StaticImageData;

/** Куда ведёт логотип: на посадочную, откуда бы шапку ни показали. */
const WELCOME_HREF = "/welcome";

/**
 * Шапка посадочной: логотип → `/welcome`, переключатель языка и, если заданы, «Войти» и
 * «Открыть демо». Её же рисует экран выбора роли `/demo`, чтобы у двух публичных страниц
 * была одна шапка и с демо был путь назад. Стили — `landing.css`, под корнем `.lp`.
 *
 * `login` и `demo` не заданы — кнопок нет: на `/demo` вход паролем закрыт, а кнопка
 * «Открыть демо» вела бы на ту же страницу.
 */
export async function LandingBar({
  locale,
  login,
  demo,
}: {
  readonly locale: Locale;
  readonly login?: string;
  readonly demo?: string | null;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "welcome" });
  return (
    <header className="lp-bar">
      <Link className="lp-bar__brand" href={WELCOME_HREF}>
        <img
          src={brandMark.src}
          width={28}
          height={28}
          alt=""
          data-testid="brand-mark"
        />
        <span>MERIDIUS</span>
      </Link>
      <div className="lp-bar__acts">
        <LocaleToggle current={locale} label={t("language")} />
        {login === undefined ? null : (
          <Link className="lp-link" href={login} data-testid="welcome-login">
            {t("login")}
          </Link>
        )}
        {demo === undefined || demo === null ? null : (
          <Link
            className="lp-cta lp-cta--sm lp-bar__demo"
            href={demo}
            prefetch={false}
            data-testid="welcome-demo-bar"
          >
            {t("demo")}
          </Link>
        )}
      </div>
    </header>
  );
}
