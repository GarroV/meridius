// Данные главной кабинета — «что требует внимания» (D183, вариант А). Своих запросов
// здесь нет и своих цифр-итогов тоже: тревоги — у ленты, дырки станций — у раздела
// «Станции», черновики и свои чек-листы — у списка чек-листов. Цифры за период живут
// в «Статистике», главная только ведёт туда ссылкой: два экрана с одной цифрой уже
// расходились (#216), а у одного числа должно быть одно место.
import { scopeOf, type Viewer } from "@/blocks/auth/scope";
import type { Locale } from "@/blocks/core/locale";
import { listChecklists } from "@/blocks/editor/listing";
import { checklistPath } from "@/blocks/editor/routes";
import type { FeedAlarms, FeedSelection } from "@/blocks/feed/model";
import { buildFeedModel } from "@/blocks/feed/ui/build-model";
import { pickText } from "@/blocks/feed/text";
import { parseFeedView } from "@/blocks/feed/view";
import { countGaps, listNetworkStations } from "@/blocks/stations/overview";

/** Сколько чек-листов показать строками; остальные — ссылкой в раздел. */
const CHECKLISTS_SHOWN = 8;

/**
 * Сколько тревог показать строками. Меньше, чем у полосы экрана пиццерии (6): на
 * телефоне строка тревоги — около 150 px, и шесть строк уводили «Что не закрыто» на
 * третий экран. Остальные — ссылкой в «Статистику».
 */
const ALARMS_SHOWN = 3;

/** Чек-лист строкой «Моих чек-листов» (D148). */
export interface HomeChecklist {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  /** «Страна · пиццерия · станция»; null — чек-лист ни на какой станции не висит. */
  readonly place: string | null;
  readonly publishedNumber: number | null;
  readonly hasUnpublishedChanges: boolean;
}

export interface HomeModel {
  /** Тревоги на сейчас: провал критичного и незаполненное в срок (D053), первые строки. */
  readonly alarms: FeedAlarms;
  /**
   * Сколько тревог не показано строками; `isMoreUncounted` — выдача упёрлась в предел и
   * тревог может быть больше. Подсказку полосы «сузьте фильтры» главная не показывает:
   * фильтров у неё нет, — вместо неё ссылка в «Статистику».
   */
  readonly moreAlarms: number;
  readonly isMoreUncounted: boolean;
  /** Область ленты — из тревоги открывают карточку заполнения в той же области. */
  readonly selection: FeedSelection;
  readonly gaps: { readonly noChecklist: number; readonly silent: number };
  /** Чек-листов вошедшего с неопубликованной правкой. */
  readonly drafts: number;
  /** Первые чек-листы вошедшего; всего их `checklistTotal`. */
  readonly checklists: readonly HomeChecklist[];
  readonly checklistTotal: number;
}

function joinPlace(parts: readonly (string | null)[]): string | null {
  const present = parts.filter((part): part is string => part !== null);
  return present.length === 0 ? null : present.join(" · ");
}

export async function loadHome(
  locale: Locale,
  viewer: Viewer,
  now: Date = new Date(),
): Promise<HomeModel> {
  // Область видимости вошедшего (D145) — та же, что у разделов: партнёр видит станции,
  // тревоги и чек-листы своих стран, УК — всю сеть. Фильтра области и периода у главной
  // больше нет: внимания требует всё своё, а разбор по области — дело «Статистики».
  const [feed, network, checklists] = await Promise.all([
    buildFeedModel(parseFeedView({}), locale, viewer, now),
    listNetworkStations(scopeOf(viewer), now),
    listChecklists({ countryId: null, storeId: null, stationId: null }, viewer),
  ]);

  const { alarms } = feed;
  return {
    alarms: {
      ...alarms,
      rows: alarms.rows.slice(0, ALARMS_SHOWN),
      hiddenCount: 0,
      capped: false,
    },
    moreAlarms:
      Math.max(0, alarms.rows.length - ALARMS_SHOWN) + alarms.hiddenCount,
    isMoreUncounted: alarms.capped,
    selection: feed.selection,
    gaps: countGaps(network),
    drafts: checklists.filter((row) => row.hasUnpublishedChanges).length,
    checklists: checklists.slice(0, CHECKLISTS_SHOWN).map((row) => ({
      id: row.id,
      href: checklistPath(row.id),
      title: pickText(row.title, locale),
      place: joinPlace([row.countryName, row.storeName, row.stationName]),
      publishedNumber: row.publishedNumber,
      hasUnpublishedChanges: row.hasUnpublishedChanges,
    })),
    checklistTotal: checklists.length,
  };
}
