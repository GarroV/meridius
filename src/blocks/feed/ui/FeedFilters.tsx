import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { FeedSelection } from "../model";
import { FEED_PATH } from "../routes";
import { FeedFilterSelects } from "./FeedFilterSelects";

/**
 * Карточка фильтров (эталон `docs/furca/design/screens/feed.html`): четыре списка и
 * «Сбросить» справа. Форма — обычная GET-форма: состояние ленты живёт в адресе, поэтому
 * ссылкой на «Кухню Алматы за неделю» можно поделиться, и она откроется тем же экраном.
 *
 * Под фильтрами подписан часовой пояс, в котором посчитан период. Без этой строки
 * «сегодня» — молчаливое допущение: у сети пиццерий в разных поясах сутки разные,
 * и управляющий обязан видеть, чьи именно он смотрит.
 */

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const BODY_CLASS = "p-[var(--space-7)]";
const ROW_CLASS = "flex flex-wrap items-end gap-[var(--space-5)]";
const RESET_CLASS =
  "ml-auto inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";
const APPLY_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium";
const HINT_CLASS =
  "mt-[var(--space-5)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";

export interface FeedFiltersProps {
  readonly selection: FeedSelection;
  /** Пояс, в котором посчитан период. */
  readonly timeZone: string;
  /** Пояс выбран не однозначно — только тогда он и подписывается. */
  readonly timeZoneAmbiguous: boolean;
  /**
   * Куда шлёт форма и куда ведёт «Сбросить». По умолчанию — лента: карточка родилась
   * там. Отчёт об обходах показывает те же фильтры на своём адресе, и подать их же
   * на адрес ленты значило бы после «Применить» тихо увести человека с отчёта.
   */
  readonly action?: string;
}

export async function FeedFilters({
  selection,
  timeZone,
  timeZoneAmbiguous,
  action = FEED_PATH,
}: FeedFiltersProps): Promise<ReactElement> {
  const t = await getTranslations("feed.filters");

  return (
    <div className={CARD_CLASS}>
      <div className={BODY_CLASS}>
        <form
          method="get"
          action={action}
          data-testid="feed-filters"
          className={ROW_CLASS}
        >
          <FeedFilterSelects
            selection={selection}
            labels={{
              country: t("country"),
              store: t("store"),
              station: t("station"),
              period: t("period"),
              all: t("all"),
              periodToday: t("periodToday"),
              periodWeek: t("periodWeek"),
              periodMonth: t("periodMonth"),
            }}
          />

          {/* Без JavaScript списки сами не применяются — тогда нужна кнопка. */}
          <noscript>
            <button type="submit" className={APPLY_CLASS}>
              {t("apply")}
            </button>
          </noscript>

          <Link href={action} data-testid="feed-reset" className={RESET_CLASS}>
            {t("reset")}
          </Link>
        </form>

        {/* Пиццерии фильтра живут в разных поясах, и «сегодня» посчитано по поясу
            площадки. В обычной работе (одна страна — один пояс) этой строки нет:
            на эталоне её тоже нет, и говорить надо только тогда, когда есть что сказать.

            Подпись НЕ называет этот пояс временем пиццерии (T183): пиццерий на
            экране несколько, ни у одной из них его нет, а строки показаны каждая
            по поясу СВОЕЙ пиццерии. Поэтому она говорит три вещи сразу: поясá
            разные, границы периода посчитаны по одному общему поясу (какому именно —
            названо), время в строках местное. Формулировку держит сторож
            `selection.test.ts`. */}
        {timeZoneAmbiguous ? (
          <p className={HINT_CLASS} data-testid="feed-timezone">
            {t("timeZoneMixed", { zone: timeZone })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
