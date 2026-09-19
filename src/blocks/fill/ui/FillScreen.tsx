import { NextIntlClientProvider, createTranslator } from "next-intl";
import { headers } from "next/headers";
import type { ReactElement } from "react";

import type { Locale } from "@/blocks/core/locale";
import { PUBLIC_FILL_PREFIX } from "@/blocks/core/public-routes";
import { StateScreen } from "@/blocks/core/ui/StateScreen";
import { getRounds } from "@/blocks/data";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

import { listAlarms } from "../alarms";
import {
  FILL_LAST_RESORT_LOCALE,
  fillDocumentLocale,
  pickFillLocales,
} from "../locale";
import { CHECKLIST_PARAM } from "../params";
import {
  checkScanAllowed,
  identifyClient,
  trustedProxyHops,
} from "../rate-limit";
import { buildRoundsPanel } from "../rounds-view";
import { loadFillTarget } from "../station";
import type { FillTarget } from "../station";
import { issueFillTicket } from "../ticket";
import { buildChoiceView, buildFillView } from "../view";
import { dropAlarmAction, setAlarmAction } from "./alarm-action";
import { ChoiceScreen } from "./ChoiceScreen";
import { FillForm } from "./FillForm";
import { markRoundAction } from "./round-action";
import { chooseShiftModeAction } from "./shift-mode-action";
import { submitFillAction } from "./submit-action";

/**
 * Публичный экран заполнения: всё, что видит человек, отсканировавший наклейку.
 *
 * Язык здесь СВОЙ, а не общий язык запроса. Общий (`src/i18n/request.ts`) знает только
 * телефон, а язык этой поверхности принадлежит пиццерии (D122): и чек-лист, и отбивка
 * «заполнять нечего» идут на том языке, который завела она. Поэтому словарь выбирается
 * прямо здесь и отдаётся клиентской части провайдером — вместе с языком, который
 * посчитала цепочка, а не тем, что решил заголовок.
 *
 * Телефон решает ровно в одном месте — там, где пиццерии нет вовсе: код не работает или
 * предел частоты сработал раньше похода в базу.
 */

const MESSAGES: Record<Locale, typeof en> = { en, ru };

/**
 * Имя заголовка стоит один раз: язык запроса читается в одном месте и дальше ездит
 * значением. Три копии строки и есть тот способ, которым одна из них однажды отстаёт.
 */
const ACCEPT_LANGUAGE = "accept-language";

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
  const acceptLanguage = requestHeaders.get(ACCEPT_LANGUAGE);
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
    // Пиццерии здесь ещё нет: предел нарочно срабатывает ДО похода в базу, иначе он
    // не защищал бы её от перебора. Значит, язык остаётся за телефоном.
    const t = translatorFor(fillDocumentLocale(acceptLanguage));
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
    // «Заполнять нечего» — отбивка НАСТОЯЩЕЙ пиццерии: человек стоит на её кухне с её
    // наклейкой, и язык этой надписи принадлежит ей, а не телефону (D122). «Код не
    // работает» — другое дело: пиццерии за ним нет никакой, и язык брать неоткуда.
    const locale =
      target.kind === "no-checklist"
        ? (pickFillLocales(acceptLanguage, target.countryLocale)[0] ??
          fillDocumentLocale(acceptLanguage))
        : fillDocumentLocale(acceptLanguage);
    const t = translatorFor(locale);
    // Ответ на неизвестный и на перевыпущенный код один и тот же: различать их
    // значило бы отвечать перебору по-разному (D021), да и в данных они неразличимы —
    // перевыпуск переписывает код станции, прежней строки не остаётся.
    //
    // А случая у сотрудника два — опечатка в наборе и отозванная наклейка, — и на
    // экране названы оба: первым тот, что лечится перенабором, вторым тот, ради
    // которого идут к управляющему (T182). Утверждать «наклейку заменили» там, где
    // такого кода никогда не было, продукт не вправе: он этого не знает, а сотрудник
    // по этому утверждению уходит за новой наклейкой вместо того, чтобы перенабрать.
    const state = target.kind === "unknown-code" ? "invalid" : "none";
    return (
      <div lang={locale}>
        <StateScreen
          testId={`fill-${state}`}
          tone="plain"
          title={t(`${state}.title`)}
          text={t(`${state}.text`)}
          {...(state === "invalid" ? { notice: t("invalid.reissued") } : {})}
        />
      </div>
    );
  }

  const locales = pickFillLocales(acceptLanguage, target.countryLocale);
  // Цепочка непустая по построению, но запасное звено здесь не буква: буква «ru»
  // пережила бы смену правила молча — ровно так и разъехались два умолчания (#129).
  const locale = locales[0] ?? FILL_LAST_RESORT_LOCALE;
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
      ? {
          items: [],
          missedTotal: 0,
          // Обходов нет — звонить не о чем и перерисовываться незачем.
          overdue: null,
          nextChangeInSeconds: null,
          ringsOnMiss: false,
        }
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
          // Пропуск на отправку: в нём серверное время выдачи экрана, и оттуда
          // берётся начало заполнения. Браузер его больше не называет — до этой
          // правки длительность в ленте управляющего была ровно тем числом,
          // которое захотел написать отправитель, а D003 оставил её единственным
          // признаком добросовестности: гео и порогов скорости под ней нет.
          ticket={issueFillTicket({ code, versionId: target.version.id }, now)}
          stationName={target.stationName}
          storeName={target.storeName}
          timeZone={target.timeZone}
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
