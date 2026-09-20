// Модель экранов QR: то, что страница посчитала, а разметка только рисует.
// Разметка не ходит в справочник и не зовёт кодировщик — иначе печатный лист
// и экран планшета считали бы одно и то же по-разному.
import type { Locale } from "@/blocks/core/locale";

import type { QrErrorCode } from "./view";

export interface QrStationView {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  /** Время выпуска кода — серверное, показывается рядом с кодом в таблице. */
  readonly codeIssuedAt: Date;
  /** Готовая картинка кода: `<svg>` одной строкой. */
  readonly svg: string;
  /** Адрес полноэкранного QR этой станции. */
  readonly screenHref: string;
}

export interface QrStoreView {
  readonly id: string;
  readonly name: string;
  readonly countryName: string;
  /** Часовой пояс пиццерии: в нём показывается дата выпуска кода. */
  readonly timezone: string;
  /**
   * Язык ПИЦЦЕРИИ — на нём говорят её печатные материалы (T273, D122).
   *
   * Он не равен языку методиста, который открыл экран: наклейку печатают здесь, а
   * читают на кухне. Посчитан один раз здесь же, а не в разметке: `PrintSheet` и
   * `StationScreen` решали бы это по-своему, и печатный лист с планшетом одной и той
   * же станции разъехались бы — ровно так же, как разъехались бы два кодировщика QR.
   */
  readonly locale: Locale;
}

/** Пиццерия в списке выбора — когда лист открыт без пиццерии в адресе. */
export interface QrStoreOption {
  readonly id: string;
  readonly name: string;
  readonly countryName: string;
  readonly stationCount: number;
  readonly href: string;
}

/** Что показывает экран печати листа. */
export interface QrModel {
  /**
   * Источник ссылки, зашитой в коды этого листа (`https://host`). Показывается на
   * экране: лист, распечатанный с `http://localhost`, ведёт наклейки в никуда, и
   * заметить это надо до того, как их наклеят, а не через месяц.
   */
  readonly scanOrigin: string;
  /** Выбранная пиццерия или `null`, если её в адресе нет (тогда показан выбор). */
  readonly store: QrStoreView | null;
  /** Станции пиццерии по алфавиту: по наклейке на каждую. */
  readonly stations: readonly QrStationView[];
  /** Станция в карточке планшета: выбранная в адресе или первая по списку. */
  readonly selected: QrStationView | null;
  /** Пиццерии для выбора. Пусто, когда пиццерия уже выбрана. */
  readonly stores: readonly QrStoreOption[];
  readonly errorCode: QrErrorCode | null;
  /**
   * Станция, про которую задан вопрос о перевыпуске кода, или `null` (T266).
   *
   * Отдельно от `selected`, хотя обе — «станция экрана». `selected` подставляет
   * первую станцию списка, когда в адресе её нет: карточке планшета всё равно, что
   * показывать. Окну подтверждения не всё равно — подставленная станция означала бы
   * вопрос про одну станцию и перевыпуск кода у другой.
   */
  readonly confirming: QrStationView | null;
}

/** Что показывает полноэкранный QR планшета. */
export interface QrScreenModel {
  readonly stationName: string;
  readonly storeName: string;
  /**
   * Язык пиццерии: планшет висит в ней, и подписи на нём читает сотрудник, а не тот,
   * кто однажды открыл экран из кабинета (T273, D122).
   */
  readonly locale: Locale;
  readonly code: string;
  readonly svg: string;
  /** Адрес, который планшет опрашивает, чтобы заметить перевыпуск кода. */
  readonly codeHref: string;
  /** Возврат на лист печати той же пиццерии. */
  readonly backHref: string;
}
