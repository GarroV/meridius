import type { useTranslations } from "next-intl";

import { ALARM_LIMITS } from "../alarm-limits";
import type { AlarmRefusal } from "../alarms";

const MINUTE_SECONDS = 60;

/**
 * Текст отказа будильника — один на панель ручных будильников (D070) и на пункт-будильник
 * чек-листа (D156): это один и тот же будильник, и сотрудник не должен читать про один
 * отказ двумя разными словами.
 *
 * Часы берутся ИЗ САМОГО ОТКАЗА, а не из шапки экрана: шапка знает окно одного
 * чек-листа, а граница вынесена по всем открытым разом. Отказ без часов означает, что на
 * станции сейчас не открыт ни один чек-лист, — называть нечего.
 */
export function alarmRefusalText(
  outcome: AlarmRefusal,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (outcome.reason) {
    case "rate-limited": {
      return t("refused.tooOften", {
        minutes: Math.max(
          1,
          Math.ceil(outcome.retryAfterSeconds / MINUTE_SECONDS),
        ),
      });
    }
    case "past-time": {
      return t("refused.pastTime");
    }
    case "outside-window": {
      return outcome.hours === undefined
        ? t("refused.checklistClosed")
        : t("refused.outsideWindow", { window: outcome.hours });
    }
    case "too-many": {
      return t("refused.tooMany", {
        count: ALARM_LIMITS.maxPerStationPerWindow,
      });
    }
    default: {
      return t("refused.broken");
    }
  }
}
