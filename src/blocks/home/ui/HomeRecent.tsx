import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { FeedModel } from "@/blocks/feed/model";
import { AlarmStrip } from "@/blocks/feed/ui/AlarmStrip";
import { OutcomeTag } from "@/blocks/feed/ui/OutcomeTag";
import { feedHref, submissionHref, type FeedView } from "@/blocks/feed/view";

import { ago } from "./ago";
import {
  CARD_CLASS,
  HEAD_CLASS,
  LINK_CLASS,
  META_CLASS,
  TITLE_CLASS,
} from "./style";

/** Сколько последних заполнений показывает витрина (§4.3: «5–7 строк»). */
const RECENT_LIMIT = 7;

const ROW_CLASS =
  "flex flex-wrap items-center gap-x-[var(--space-5)] gap-y-[var(--space-2)] border-b border-[var(--line)] px-[var(--space-7)] py-[var(--space-5)] last:border-b-0";
const ALL_CLASS =
  "ml-auto text-[length:var(--fs-meta)] font-medium text-[var(--accent)] no-underline hover:underline";

/**
 * «Что происходит» (§4.3): тревоги на сейчас и последние заполнения. Это витрина, а не
 * рабочее место — работают в «Статистике» (D179): ссылка ведёт на экран выбранной
 * пиццерии, где теперь живёт лента, а без пиццерии — в раздел с той же страной.
 * Своей таблицы ленты здесь нет: её заголовок считал бы строки витрины и спорил бы с
 * цифрой заполнений за период над ней.
 */
export async function HomeRecent({
  feed,
  view,
  now,
  locale,
}: {
  readonly feed: FeedModel;
  readonly view: FeedView;
  readonly now: Date;
  readonly locale: string;
}): Promise<ReactElement> {
  const t = await getTranslations("adminHome.recent");
  const rows = feed.rows.slice(0, RECENT_LIMIT);

  return (
    <section
      className="flex flex-col gap-[var(--space-5)]"
      data-testid="home-recent"
    >
      <AlarmStrip alarms={feed.alarms} selection={feed.selection} />
      <div className={CARD_CLASS}>
        <div className={HEAD_CLASS}>
          <h2 className={TITLE_CLASS}>{t("title")}</h2>
          <Link href={feedHref(view)} className={ALL_CLASS}>
            {t("all")}
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className={`${ROW_CLASS} ${META_CLASS} m-0`}>{t("empty")}</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className={ROW_CLASS}
              data-testid="home-recent-row"
            >
              <span className={`${META_CLASS} min-w-[9ch]`}>
                {ago(row.submittedAt, now, locale)}
              </span>
              <Link
                href={submissionHref(row.id, feed.selection)}
                className={LINK_CLASS}
              >
                {row.checklistTitle}
              </Link>
              <span className={META_CLASS}>
                {row.storeName} · {row.stationName}
              </span>
              <span className="ml-auto">
                <OutcomeTag outcome={row.outcome} />
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
