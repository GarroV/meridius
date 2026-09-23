import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { PUBLIC_PAIR_PATH } from "@/blocks/core/public-routes";

import { PIN_TTL_SECONDS } from "../pin";
import { issuePinAction } from "./issue-pin-action";
import { PairTabletButton } from "./PairTabletButton";

const SECONDS_IN_MINUTE = 60;

// Карточка повторяет боковые панели редактора (`editor/ui/SidePanels.tsx`): она стоит
// в том же столбце, и свой вид тут читался бы как чужой экран. Эталона у действия нет —
// расхождение записано в `docs/furca/blocks/device.md`.
const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const CARD_HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const CARD_TITLE_CLASS =
  "text-[length:var(--fs-dense)] font-semibold tracking-[var(--tracking-micro)] uppercase";
const CARD_BODY_CLASS =
  "flex flex-col gap-[var(--space-5)] px-[var(--space-7)] py-[var(--space-6)]";
const BLOCKED_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";

/**
 * Действие «Привязать планшет» на экране чек-листа.
 *
 * Станция берётся СОХРАНЁННАЯ, а не выбранная в поле: пин привязывает к станции
 * навсегда, и выпуск его по несохранённому выбору привязал бы планшет не туда.
 * Поэтому без станции карточка объясняет, что сделать, а не отказывает молча.
 *
 * Станция уходит в действие привязанным аргументом: значение не проходит через
 * браузер и подменить его нельзя.
 */
export async function PairTabletCard({
  stationId,
}: {
  readonly stationId: string | null;
}): Promise<ReactElement> {
  const t = await getTranslations("device.issue");

  return (
    <div className={CARD_CLASS} data-testid="pair-tablet-card">
      <div className={CARD_HEAD_CLASS}>
        <span className={CARD_TITLE_CLASS}>{t("title")}</span>
      </div>
      <div className={CARD_BODY_CLASS}>
        {stationId === null ? (
          <p data-testid="pair-tablet-blocked" className={BLOCKED_CLASS}>
            {t("noStation")}
          </p>
        ) : (
          <PairTabletButton
            issue={issuePinAction.bind(null, stationId)}
            labels={{
              action: t("action"),
              again: t("again"),
              hint: t("hint", { minutes: PIN_TTL_SECONDS / SECONDS_IN_MINUTE }),
              where: t("where", { path: PUBLIC_PAIR_PATH }),
              failed: t("failed"),
            }}
          />
        )}
      </div>
    </div>
  );
}
