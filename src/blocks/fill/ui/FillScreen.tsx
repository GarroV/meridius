import { NextIntlClientProvider, createTranslator } from "next-intl";
import type { ReactElement } from "react";

import type { Locale } from "@/blocks/core/locale";
import { PUBLIC_FILL_PREFIX } from "@/blocks/core/public-routes";
import { StateScreen } from "@/blocks/core/ui/StateScreen";
import { getRounds } from "@/blocks/data";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

import { listAlarms } from "../alarms";
import { fillLanguage } from "../document";
import { CHECKLIST_PARAM } from "../params";
import { buildRoundsPanel } from "../rounds-view";
import { loadFillTarget } from "../station";
import type { FillTarget } from "../station";
import type { TabletTab } from "../model";
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
 * «заполнять нечего» идут на том языке, который завела она. Телефон решает ровно в одном
 * месте — там, где пиццерии нет вовсе: код не работает или предел частоты сработал
 * раньше похода в базу.
 *
 * Считается это НЕ здесь, а в `../document`, и не из вкусовщины: тот же ответ нужен
 * корневой разметке для `<html lang>`, а два вычисления одного языка в двух местах и дали
 * документ, объявленный языком телефона поверх текста на языке пиццерии (T270). Здесь
 * ответ только берётся — вместе с вердиктом предела частоты, который считается там же.
 */

const MESSAGES: Record<Locale, typeof en> = { en, ru };

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
  tablet,
}: {
  readonly code: string;
  /**
   * Выбранный чек-лист из адресной строки (`?c=`). Чужой или закрывшийся
   * идентификатор не подставляет свой молча — экран снова показывает выбор.
   */
  readonly checklistId?: string | undefined;
  /**
   * Экран открыт в привязанной вкладке планшета (блок `device`). Телефон по наклейке
   * этого признака не получает НИКОГДА: часы, удержание экрана, чип звука и сброс
   * недозаполненного — поведение планшета у станции, а не всякого, кто отсканировал.
   */
  readonly tablet?: TabletTab | undefined;
}): Promise<ReactElement> {
  // Язык экрана и вердикт предела частоты — одно решение на запрос, общее с документом.
  // Цепочка `locales` нужна текстам самого чек-листа: методист мог завести пункт только
  // на одном языке, и тогда показывается тот, что есть, в том же порядке предпочтения.
  const { locale, locales, tooOften } = await fillLanguage(code);
  const t = translatorFor(locale);

  if (tooOften) {
    // Пиццерии здесь нет: предел нарочно срабатывает ДО похода в базу, иначе он не
    // защищал бы её от перебора. Значит, язык остался за телефоном — так его и посчитали.
    return (
      <>
        {tablet?.extras}
        <StateScreen
          testId="fill-too-often"
          tone="plain"
          title={t("tooOften.title")}
          text={t("tooOften.text")}
        />
      </>
    );
  }

  // Время берётся один раз и идёт и в выбор версии, и в состояние обходов: два вызова
  // `new Date()` на границе часа развели бы экран и его обходы по разным проходам.
  const now = new Date();
  const target: FillTarget = await loadFillTarget(code, now, checklistId);

  if (target.kind === "unknown-code" || target.kind === "no-checklist") {
    // Язык обеих надписей уже посчитан выше, и посчитан по-разному сам собой:
    // «заполнять нечего» — отбивка НАСТОЯЩЕЙ пиццерии, человек стоит на её кухне с её
    // наклейкой, и надпись принадлежит ей (D122); «код не работает» — другое дело,
    // пиццерии за подобранным кодом нет никакой, и язык остаётся за телефоном. Разницу
    // даёт та же цепочка: у станции, которой нет, нет и языка страны.
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
        {tablet?.extras}
        <StateScreen
          testId={`fill-${state}`}
          tone="plain"
          title={t(`${state}.title`)}
          text={t(`${state}.text`)}
          {...(state === "invalid" ? { notice: t("invalid.reissued") } : {})}
          {...(state === "none" && tablet?.idle !== undefined
            ? { note: tablet.idle }
            : {})}
        />
      </div>
    );
  }

  // Несколько чек-листов открыты в одну минуту — выбирает сотрудник, а не порядок
  // сортировки (#60). Ссылка, а не форма: переход обязан работать до того, как на
  // телефон в подсобке доедет клиентский код.
  if (target.kind === "choice") {
    return (
      <div lang={locale}>
        {tablet?.extras}
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
      {tablet?.extras}
      <NextIntlClientProvider
        locale={locale}
        messages={{ fill: MESSAGES[locale].fill }}
      >
        <FillForm
          // Ключ — опознаватель текущего окна и открытой версии. Сменилось окно, и
          // React снимает форму вместе с недозаполненным черновиком: он живёт в
          // состоянии формы, и обновления страницы не переживает ТОЛЬКО так.
          // На телефоне ключа нет вовсе — там терять ответы не за что.
          //
          // Ключ стоит прямо, а не приезжает расширением объекта: React 19 ругается на
          // `key` внутри расширения предупреждением в консоли — увидено живым запуском.
          key={
            tablet === undefined
              ? undefined
              : `${tablet.windowKey}:${target.version.id}`
          }
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
