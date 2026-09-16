import { NextIntlClientProvider, createTranslator } from "next-intl";
import { headers } from "next/headers";
import type { ReactElement } from "react";

import type { Locale } from "@/blocks/core/locale";
import { PUBLIC_FILL_PREFIX } from "@/blocks/core/public-routes";
import { getRounds } from "@/blocks/data";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

import { listAlarms } from "../alarms";
import { pickFillLocales } from "../locale";
import { CHECKLIST_PARAM } from "../params";
import {
  checkScanAllowed,
  identifyClient,
  trustedProxyHops,
} from "../rate-limit";
import { buildRoundsPanel } from "../rounds-view";
import { loadFillTarget } from "../station";
import type { FillTarget } from "../station";
import { buildChoiceView, buildFillView } from "../view";
import { dropAlarmAction, setAlarmAction } from "./alarm-action";
import { ChoiceScreen } from "./ChoiceScreen";
import { FillForm } from "./FillForm";
import { markRoundAction } from "./round-action";
import { chooseShiftModeAction } from "./shift-mode-action";
import { StateScreen } from "./StateScreen";
import { submitFillAction } from "./submit-action";

/**
 * Публичный экран заполнения: всё, что видит человек, отсканировавший наклейку.
 *
 * Язык здесь СВОЙ, а не общий язык запроса. Общий (`src/i18n/request.ts`) отвечает
 * одинаково на «телефон просит английский» и «телефон просит язык, которого у нас нет»,
 * а этому экрану во втором случае нужен язык страны пиццерии (T038). Поэтому словарь
 * выбирается прямо здесь и отдаётся клиентской части провайдером — вместе с языком,
 * который посчитала цепочка, а не тем, что решил заголовок.
 */

const MESSAGES: Record<Locale, typeof en> = { en, ru };

/** Язык, на котором говорит отказ, когда о станции ещё ничего не известно. */
async function refusalLocale(): Promise<Locale> {
  const acceptLanguage = (await headers()).get("accept-language");
  return pickFillLocales(acceptLanguage, null)[0] ?? "ru";
}

function translatorFor(locale: Locale) {
  return createTranslator({
    locale,
    messages: MESSAGES[locale],
    namespace: "fill",
  });
}

export async function FillScreen({
  code,
  checklistId,
}: {
  readonly code: string;
  /**
   * Выбранный чек-лист из адресной строки (`?c=`). Чужой или закрывшийся
   * идентификатор не подставляет свой молча — экран снова показывает выбор.
   */
  readonly checklistId?: string | undefined;
}): Promise<ReactElement> {
  const requestHeaders = await headers();
  const client = identifyClient({
    forwardedFor: requestHeaders.get("x-forwarded-for"),
    // Адреса соединения среда выполнения не даёт: Next подставляет его в тот же
    // заголовок и только когда клиент своего не прислал — отличить одно от другого
    // нечем. Появится источник адреса — он подставляется сюда, и предел оживает сам.
    peerAddress: null,
    trustedProxyHops: trustedProxyHops(process.env),
  });

  // Предел на клиента применяется, только когда клиентов есть чем различать.
  // Один общий ключ превратил бы его в рубильник на всю сеть (см. `identifyClient`).
  if (client !== null && !checkScanAllowed(client, new Date()).allowed) {
    const t = translatorFor(await refusalLocale());
    return (
      <StateScreen
        testId="fill-too-often"
        tone="plain"
        title={t("tooOften.title")}
        text={t("tooOften.text")}
      />
    );
  }

  // Время берётся один раз и идёт и в выбор версии, и в состояние обходов: два вызова
  // `new Date()` на границе часа развели бы экран и его обходы по разным проходам.
  const now = new Date();
  const target: FillTarget = await loadFillTarget(code, now, checklistId);

  if (target.kind === "unknown-code" || target.kind === "no-checklist") {
    const locale = await refusalLocale();
    const t = translatorFor(locale);
    // Неизвестный и перевыпущенный код дают один и тот же экран: различать их
    // значило бы отвечать перебору по-разному (D021).
    const state = target.kind === "unknown-code" ? "invalid" : "none";
    return (
      <div lang={locale}>
        <StateScreen
          testId={`fill-${state}`}
          tone="plain"
          title={t(`${state}.title`)}
          text={t(`${state}.text`)}
        />
      </div>
    );
  }

  const locales = pickFillLocales(
    requestHeaders.get("accept-language"),
    target.countryLocale,
  );
  const locale = locales[0] ?? "ru";
  const t = translatorFor(locale);

  // Несколько чек-листов открыты в одну минуту — выбирает сотрудник, а не порядок
  // сортировки (#60). Ссылка, а не форма: переход обязан работать до того, как на
  // телефон в подсобке доедет клиентский код.
  if (target.kind === "choice") {
    return (
      <div lang={locale}>
        <ChoiceScreen
          view={buildChoiceView({
            options: target.options,
            storeName: target.storeName,
            stationName: target.stationName,
            locales,
          })}
          title={t("choice.title")}
          text={t("choice.text")}
          hrefFor={(id) =>
            `${PUBLIC_FILL_PREFIX}${encodeURIComponent(code)}?${CHECKLIST_PARAM}=${encodeURIComponent(id)}`
          }
        />
      </div>
    );
  }

  // Состояние обходов считает слой данных по местному времени пиццерии: экран его
  // только показывает. `null` — обходов у этой версии нет или чек-лист уже закрыт.
  const rounds = await getRounds(target.version.id, now);
  const panel =
    rounds === null
      ? { items: [], missedTotal: 0 }
      : buildRoundsPanel({
          rounds,
          sections: target.sections,
          locales,
          labels: {
            checkBefore: (time) => t("rounds.checkBefore", { time }),
            checkNow: t("rounds.checkNow"),
            doneAt: (time) => t("rounds.doneAt", { time }),
            nextAt: (time) => t("rounds.nextAt", { time }),
            finished: t("rounds.finished"),
            missed: (count) => t("rounds.missed", { count }),
            yes: t("rounds.yes"),
            no: t("rounds.no"),
          },
        });

  // Будильники читаются тем же `now`, что и версия с обходами: отсчёт до звонка
  // уходит в браузер секундами от этого мига, а не мигом времени (часы планшета врут).
  const alarms = await listAlarms(code, now);

  const view = buildFillView({
    // Пункты уже отфильтрованы действующим режимом смены (`loadFillTarget`):
    // фильтр живёт в одном месте, а не повторяется здесь.
    sections: target.sections,
    checklistTitle: target.checklist.title,
    storeName: target.storeName,
    stationName: target.stationName,
    windowStart: target.checklist.windowStart,
    windowEnd: target.checklist.windowEnd,
    locales,
    labels: {
      range: (min, max) => t("range", { min, max }),
      rangeFrom: (min) => t("rangeFrom", { min }),
      rangeTo: (max) => t("rangeTo", { max }),
    },
  });

  return (
    // Язык проставлен на самом экране, а не на <html>: корневая разметка общая
    // с админкой и знает только язык запроса, а здесь он мог откатиться на язык страны.
    <div lang={locale}>
      <NextIntlClientProvider
        locale={locale}
        messages={{ fill: MESSAGES[locale].fill }}
      >
        <FillForm
          view={view}
          code={code}
          versionId={target.version.id}
          stationName={target.stationName}
          storeName={target.storeName}
          shift={{ mode: target.mode, chosen: target.modeChosen }}
          choose={chooseShiftModeAction}
          submit={submitFillAction}
          rounds={panel}
          mark={markRoundAction}
          alarms={alarms}
          addAlarm={setAlarmAction}
          dropAlarm={dropAlarmAction}
        />
      </NextIntlClientProvider>
    </div>
  );
}
