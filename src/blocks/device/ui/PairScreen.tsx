import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { StateScreen } from "@/blocks/core/ui/StateScreen";

import { pairAction } from "./pair-action";
import { PairForm } from "./PairForm";

/**
 * Страница привязки планшета. Эталона у неё нет (`docs/furca/design/map.md` экранов
 * планшета не содержит), поэтому строится языком отбивок `states.html`: тот же
 * полноэкранный столбец по центру, что видит сотрудник на всех остальных состояниях.
 *
 * Язык — язык УСТРОЙСТВА, а не пиццерии: до ввода пина продукт о пиццерии не знает
 * ничего. Тот же случай, что отказ по неизвестному коду станции (D122). После успешного
 * ввода планшет уезжает на `/station`, и там язык уже принадлежит пиццерии.
 */
export async function PairScreen(): Promise<ReactElement> {
  const t = await getTranslations("device.pair");

  return (
    <StateScreen
      testId="pair-screen"
      tone="plain"
      title={t("title")}
      text={t("text")}
      action={
        <PairForm
          labels={{
            field: t("label"),
            submit: t("submit"),
            broken: t("broken"),
          }}
          pair={pairAction}
        />
      }
    />
  );
}
