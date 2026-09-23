import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { PUBLIC_PAIR_PATH } from "@/blocks/core/public-routes";
import { StateScreen, STATE_ACTION_CLASS } from "@/blocks/core/ui/StateScreen";
import { FillScreen } from "@/blocks/fill/ui/FillScreen";

import { currentDevice } from "../current";
import { stationWindows, tabletClock } from "../windows";
import { TabletExtras } from "./TabletExtras";
import { LEFT_PLACEHOLDER, TabletIdle } from "./TabletIdle";

/**
 * Привязанная вкладка станции: тот же экран заполнения, что на телефоне, плюс четыре
 * вещи от планшета — часы на смену состояния, сброс недозаполненного, удержание экрана
 * и чип звука.
 *
 * Код станции в адресе не участвует вовсе: его спрашивает у базы строка устройства, и
 * спрашивает ЗАНОВО на каждой отрисовке — поэтому перевыпуск кода (D006) вкладку не
 * задевает. Живая строка проверяется тем же запросом: подпись куки без неё не значит
 * ничего, и отвязка из кабинета действует тем же мигом.
 */
export async function TabletScreen(): Promise<ReactElement> {
  const device = await currentDevice();
  const t = await getTranslations("device.tab");

  if (device === null) {
    // Ни пустой ошибки, ни чужого чек-листа: планшет отвязали, удалили его станцию или
    // кука не наша — ответ один, и он говорит, что делать дальше.
    return (
      <StateScreen
        testId="tablet-unpaired"
        tone="plain"
        title={t("unpaired.title")}
        text={t("unpaired.text")}
        action={
          <Link href={PUBLIC_PAIR_PATH} className={STATE_ACTION_CLASS}>
            {t("unpaired.action")}
          </Link>
        }
      />
    );
  }

  const clock = tabletClock(
    await stationWindows(device.stationCode),
    new Date(),
  );

  return (
    <FillScreen
      code={device.stationCode}
      tablet={{
        windowKey: clock.windowKey,
        extras: (
          <TabletExtras
            nextChangeInSeconds={clock.nextChangeInSeconds}
            sound={{
              enable: t("sound.enable"),
              enabled: t("sound.enabled"),
              blocked: t("sound.blocked"),
            }}
          />
        ),
        idle:
          clock.opensInSeconds === null ? undefined : (
            <TabletIdle
              opensInSeconds={clock.opensInSeconds}
              label={t("opensIn", { left: LEFT_PLACEHOLDER })}
            />
          ),
      }}
    />
  );
}
