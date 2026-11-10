import type { StaticImageData } from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import { LOGIN_PATH } from "@/blocks/auth/routes";
import { publicPath } from "@/blocks/core/base-path";
import brandMarkFile from "@/blocks/core/brand/mark-small.svg";
import type { Locale } from "@/blocks/core/locale";
import { LocaleToggle } from "@/blocks/core/ui/LocaleToggle";

import "./landing.css";
import { demoHref } from "./demo-link";
import {
  loadShotSizes,
  shotKey,
  shotSrc,
  SHOTS_DIR,
  type ShotName,
  type ShotSizes,
} from "./shots";

const brandMark = brandMarkFile as StaticImageData;

/** Рамка-заглушка до съёмки: пропорции снимка, а не битая картинка. */
const PLACEHOLDER_RATIO: Readonly<Record<ShotName, string>> = {
  fill: "9 / 19",
  tablet: "4 / 3",
  editor: "16 / 10",
  qr: "16 / 10",
  stats: "16 / 10",
  feed: "16 / 10",
  network: "16 / 8",
  templates: "16 / 10",
};

interface ShotProps {
  readonly name: ShotName;
  readonly locale: Locale;
  readonly sizes: ShotSizes;
  readonly alt: string;
  readonly isEager?: boolean;
}

/**
 * Снимок настоящего экрана демо-стенда. Файла в `sizes.json` ещё нет — пустая рамка с
 * тем же описанием для чтеца: страница выглядит законченной и до первой съёмки.
 */
function Shot({
  name,
  locale,
  sizes,
  alt,
  isEager = false,
}: ShotProps): ReactElement {
  const size = sizes[shotKey(name, locale)];
  if (size === undefined) {
    return (
      <div
        className="lp-shot lp-shot--empty"
        role="img"
        aria-label={alt}
        style={{ aspectRatio: PLACEHOLDER_RATIO[name] }}
        data-testid={`shot-empty-${name}`}
      />
    );
  }
  return (
    <img
      className="lp-shot"
      src={shotSrc(name, locale)}
      width={size[0]}
      height={size[1]}
      alt={alt}
      decoding="async"
      loading={isEager ? "eager" : "lazy"}
      data-testid={`shot-${name}`}
    />
  );
}

interface SheetProps {
  readonly tone: "white" | "beige" | "purple";
  readonly labelledBy: string;
  readonly tab?: {
    readonly label: string;
    readonly step?: number;
    readonly place: number;
  };
  readonly className?: string;
  readonly children: ReactNode;
}

/** Лист стопки: сплошной фон, наезжает на предыдущий; закладка — шаг пути. */
function Sheet({
  tone,
  labelledBy,
  tab,
  className = "",
  children,
}: SheetProps): ReactElement {
  return (
    <section
      className={`lp-sheet lp-sheet--${tone} ${className}`.trim()}
      aria-labelledby={labelledBy}
    >
      {tab === undefined ? null : (
        <p
          className="lp-tab"
          style={{ "--lp-tab-i": tab.place } as React.CSSProperties}
        >
          {tab.step === undefined ? null : (
            <span className="lp-tab__n">{tab.step}</span>
          )}
          {tab.label}
        </p>
      )}
      {children}
    </section>
  );
}

function Lines({
  items,
  isRows = false,
}: {
  readonly items: readonly string[];
  readonly isRows?: boolean;
}): ReactElement {
  return (
    <ul className={isRows ? "lp-lines lp-lines--rows" : "lp-lines"}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Посадочная `/welcome` (D193): что за продукт и две двери — «Open demo» и «Sign in».
 *
 * Стопка листов, как у Decimus: каждый раздел — лист на сплошном фоне, наезжающий на
 * предыдущий (`position: sticky`, стили — `landing.css`, закладки и `top` листов выше
 * окна ведёт `public/landing/landing.js`). Картинки — настоящие снимки демо-стенда
 * (`npm run landing-shots`), других здесь нет. Шапка своя: общей до входа нет.
 *
 * Кнопки демо нет, если адрес демо не задан (`demoHref` пуст).
 */
export async function LandingPage({
  locale,
}: {
  readonly locale: Locale;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "welcome" });
  // Ссылки на демо идут с `prefetch={false}`: вход в демо — обработчик с побочным
  // действием (выбор роли, сессия), и Next не должен дёргать его заранее, пока
  // человек ещё читает страницу.
  const demo = demoHref(locale);
  const sizes = loadShotSizes();
  const login = LOGIN_PATH;
  const alt = (name: ShotName): string => t(`alt.${name}`);
  const shot = (name: ShotName, isEager = false): ReactElement => (
    <Shot
      name={name}
      locale={locale}
      sizes={sizes}
      alt={alt(name)}
      isEager={isEager}
    />
  );

  return (
    <div className="lp" data-testid="welcome" lang={locale}>
      <header className="lp-bar">
        <Link className="lp-bar__brand" href="/welcome">
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
          <Link className="lp-link" href={login} data-testid="welcome-login">
            {t("login")}
          </Link>
          {demo === null ? null : (
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

      <main>
        <Sheet tone="white" labelledBy="lp-h1" className="lp-hero">
          <div className="lp-cols lp-cols--hero">
            <div className="lp-copy">
              <h1 className="lp-display" id="lp-h1" data-testid="title">
                {t("hero.title")}
              </h1>
              <p className="lp-sub">{t("hero.sub")}</p>
              <p className="lp-body">{t("hero.lead")}</p>
              {demo === null ? null : (
                <div className="lp-cta-row">
                  <Link
                    className="lp-cta"
                    href={demo}
                    prefetch={false}
                    data-testid="welcome-demo-hero"
                  >
                    {t("demo")}
                  </Link>
                  <p className="lp-note">{t("demoNote")}</p>
                </div>
              )}
            </div>
            <div className="lp-phone">{shot("fill", true)}</div>
          </div>
        </Sheet>

        <Sheet
          tone="beige"
          labelledBy="lp-build"
          tab={{ label: t("build.tab"), step: 1, place: 0 }}
        >
          <div className="lp-cols">
            <div className="lp-copy">
              <h2 className="lp-h2" id="lp-build">
                {t("build.title")}
              </h2>
              <p className="lp-body">{t("build.body")}</p>
            </div>
            <div className="lp-fig">{shot("editor")}</div>
          </div>
        </Sheet>

        <Sheet
          tone="white"
          labelledBy="lp-print"
          tab={{ label: t("print.tab"), step: 2, place: 1 }}
        >
          <div className="lp-cols">
            <div className="lp-copy">
              <h2 className="lp-h2" id="lp-print">
                {t("print.title")}
              </h2>
              <p className="lp-body">{t("print.body")}</p>
            </div>
            <div className="lp-fig">{shot("qr")}</div>
          </div>
        </Sheet>

        <Sheet
          tone="beige"
          labelledBy="lp-fill"
          tab={{ label: t("fill.tab"), step: 3, place: 2 }}
        >
          <div className="lp-cols lp-cols--top">
            <div className="lp-copy">
              <h2 className="lp-h2" id="lp-fill">
                {t("fill.title")}
              </h2>
              <p className="lp-body">{t("fill.body")}</p>
              <div className="lp-split lp-split--under">
                {(["phone", "tablet"] as const).map((who) => (
                  <div className="lp-split__col" key={who}>
                    <h3 className="lp-split__h">{t(`fill.${who}`)}</h3>
                    <Lines
                      items={[
                        t(`fill.${who}1`),
                        t(`fill.${who}2`),
                        t(`fill.${who}3`),
                      ]}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="lp-fig">{shot("tablet")}</div>
          </div>
        </Sheet>

        <Sheet
          tone="white"
          labelledBy="lp-see"
          tab={{ label: t("see.tab"), step: 4, place: 3 }}
        >
          <div className="lp-cols">
            <div className="lp-copy">
              <h2 className="lp-h2" id="lp-see">
                {t("see.title")}
              </h2>
              <p className="lp-body">{t("see.body")}</p>
            </div>
            <div className="lp-fig lp-fig--stack">
              {shot("stats")}
              {shot("feed")}
            </div>
          </div>
        </Sheet>

        <Sheet
          tone="beige"
          labelledBy="lp-net"
          tab={{ label: t("net.tab"), place: 4 }}
          className="lp-net"
        >
          <div className="lp-copy lp-copy--wide">
            <h2 className="lp-h2" id="lp-net">
              {t("net.title")}
            </h2>
            <p className="lp-body">{t("net.body")}</p>
          </div>
          <div className="lp-fig lp-fig--full">{shot("network")}</div>
          <div className="lp-cols lp-cols--even lp-net__more">
            <Lines
              isRows
              items={[
                t("net.more1"),
                t("net.more2"),
                t("net.more3"),
                t("net.more4"),
              ]}
            />
            <div className="lp-fig">{shot("templates")}</div>
          </div>
        </Sheet>

        <Sheet tone="purple" labelledBy="lp-final" className="lp-final">
          <div className="lp-copy lp-copy--final">
            <h2 className="lp-display lp-display--md" id="lp-final">
              {t("cta.title")}
            </h2>
            <p className="lp-body">{t("cta.body")}</p>
            {demo === null ? null : (
              <div className="lp-cta-row">
                <Link
                  className="lp-cta"
                  href={demo}
                  prefetch={false}
                  data-testid="welcome-demo-final"
                >
                  {t("demo")}
                </Link>
              </div>
            )}
            <p className="lp-final__login">
              <Link className="lp-link" href={login}>
                {t("cta.login")}
              </Link>
            </p>
          </div>
        </Sheet>
      </main>
      <script src={publicPath(`/${SHOTS_DIR}/landing.js`)} defer />
    </div>
  );
}
