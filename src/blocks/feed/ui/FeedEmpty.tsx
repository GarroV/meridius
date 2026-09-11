import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { FeedEmptyKind } from "../model";
import { FEED_PATH } from "../routes";

/**
 * Пустая лента объясняет причину и следующий шаг, а не молчит (критерий готовности
 * блока). Причин ровно три, и предлагать в них надо разное: заводить справочник,
 * печатать коды или расширять период — совет невпопад хуже отсутствия совета.
 *
 * Адреса соседних разделов вписаны строками: границы модулей запрещают ленте
 * зависеть от блоков `catalog` и `qr` (.dependency-cruiser.cjs).
 */
const CATALOG_PATH = "/admin/catalog";
const QR_PATH = "/admin/qr";

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const EMPTY_CLASS =
  "flex flex-col items-center gap-[var(--space-5)] px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]";
const TITLE_CLASS =
  "text-ink m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const TEXT_CLASS = "m-0 max-w-[520px]";
const BTN_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";

const CONTENT: Record<
  FeedEmptyKind,
  { title: string; text: string; action: string; href: string }
> = {
  never: {
    title: "neverTitle",
    text: "neverText",
    action: "neverAction",
    href: QR_PATH,
  },
  period: {
    title: "periodTitle",
    text: "periodText",
    action: "periodAction",
    href: FEED_PATH,
  },
  "no-stations": {
    title: "noStationsTitle",
    text: "noStationsText",
    action: "noStationsAction",
    href: CATALOG_PATH,
  },
};

export async function FeedEmpty({
  kind,
}: {
  readonly kind: FeedEmptyKind;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.empty");
  const content = CONTENT[kind];

  return (
    <div className={CARD_CLASS}>
      <div className={EMPTY_CLASS} data-testid="feed-empty" data-kind={kind}>
        <p className={TITLE_CLASS}>{t(content.title)}</p>
        <p className={TEXT_CLASS}>{t(content.text)}</p>
        <Link href={content.href} className={BTN_CLASS}>
          {t(content.action)}
        </Link>
      </div>
    </div>
  );
}
