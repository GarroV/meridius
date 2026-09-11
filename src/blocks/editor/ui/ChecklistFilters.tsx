import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { ChecklistFilterSelection } from "../filter-options";
import { CHECKLISTS_PATH } from "../routes";
import { ChecklistFilterSelects } from "./ChecklistFilterSelects";

/**
 * Карточка фильтров над списком чек-листов (эталон
 * `docs/furca/design/screens/templates.html`, строки 48–57): три списка внутри
 * `.card` → `.card__body` → `.inline`. Сужение и согласование выбора уже посчитаны —
 * компонент только рисует то, что пришло в `selection`.
 *
 * Устройство скопировано с фильтров ленты (`src/blocks/feed/ui/FeedFilters.tsx`):
 * карточка-обёртка серверным компонентом с текстами + клиентский компонент со
 * списками. Импортировать из `feed` нельзя — границы модулей это запрещают
 * (`.dependency-cruiser.cjs`), поэтому классы карточки скопированы (те же, что уже
 * использует `ChecklistsScreen.tsx`), а не переиспользованы.
 */

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const BODY_CLASS = "p-[var(--space-7)]";
const ROW_CLASS = "flex flex-wrap items-end gap-[var(--space-5)]";
const APPLY_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium";

export interface ChecklistFiltersProps {
  readonly selection: ChecklistFilterSelection;
}

export async function ChecklistFilters({
  selection,
}: ChecklistFiltersProps): Promise<ReactElement> {
  const t = await getTranslations("editor.list");

  return (
    <div className={CARD_CLASS}>
      <div className={BODY_CLASS}>
        <form
          method="get"
          action={CHECKLISTS_PATH}
          data-testid="checklist-filters"
          className={ROW_CLASS}
        >
          <ChecklistFilterSelects
            selection={selection}
            labels={{
              country: t("filterCountry"),
              store: t("filterStore"),
              station: t("filterStation"),
              all: t("filterAll"),
            }}
          />

          {/* Без JavaScript списки сами не применяются — тогда нужна кнопка. */}
          <noscript>
            <button type="submit" className={APPLY_CLASS}>
              {t("filterApply")}
            </button>
          </noscript>
        </form>
      </div>
    </div>
  );
}
