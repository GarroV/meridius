import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { AlarmStrip } from "@/blocks/feed/ui/AlarmStrip";

import type { HomeModel } from "../load";
import { HomeChecklists } from "./HomeChecklists";
import { HomeTodo } from "./HomeTodo";

const STATS_LINK_CLASS =
  "font-medium text-[var(--accent)] no-underline hover:underline";

/**
 * Главная кабинета — «что требует внимания» (D183, вариант А). Сверху вниз: тревоги на
 * сейчас, что не закрыто (станции без чек-листа, молчащие станции, черновики), мои
 * чек-листы (D148). Своих цифр-итогов у главной нет: плитки за период, «N из M станций в
 * работе» и сводка по пиццериям сняты — цифры живут в «Статистике», куда ведёт ссылка.
 */
export async function HomeScreen({
  model,
}: {
  readonly model: HomeModel;
}): Promise<ReactElement> {
  const t = await getTranslations("adminHome");

  return (
    <div
      data-testid="admin-home"
      className="flex flex-col gap-[var(--space-7)]"
    >
      <div className="flex flex-col gap-[var(--space-3)]">
        <AlarmStrip alarms={model.alarms} selection={model.selection} />
        {model.moreAlarms > 0 || model.isMoreUncounted ? (
          <Link
            href={ADMIN_SECTIONS.feed.path}
            className={`${STATS_LINK_CLASS} text-[length:var(--fs-body)]`}
            data-testid="home-alarms-more"
          >
            {model.isMoreUncounted
              ? t("alarmsMoreUncounted")
              : t("alarmsMore", { count: model.moreAlarms })}
          </Link>
        ) : null}
      </div>

      <HomeTodo gaps={model.gaps} drafts={model.drafts} />

      <HomeChecklists
        checklists={model.checklists}
        total={model.checklistTotal}
      />

      <p className="m-0 text-[length:var(--fs-body)] text-[var(--ink-2)]">
        {t("statsHint")}{" "}
        <Link
          href={ADMIN_SECTIONS.feed.path}
          className={STATS_LINK_CLASS}
          data-testid="home-stats-link"
        >
          {t("statsLink")}
        </Link>
      </p>
    </div>
  );
}
