import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { AlarmStrip } from "@/blocks/feed/ui/AlarmStrip";

import type { HomeModel } from "../load";
import { HomeChecklists } from "./HomeChecklists";
import { HomeTodo } from "./HomeTodo";
import { META_CLASS } from "./style";

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
      <AlarmStrip alarms={model.alarms} selection={model.selection} />

      <HomeTodo gaps={model.gaps} drafts={model.drafts} />

      <HomeChecklists
        checklists={model.checklists}
        total={model.checklistTotal}
      />

      <p className={`${META_CLASS} m-0`}>
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
