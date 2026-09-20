// Что публичный маршрут узнаёт по коду со наклейки — и ничего сверх этого (D021).
//
// Запросы свои, а не заказаны в блоке `data`: так устроены границы проекта (D024).
// Правило выбора версии по окну и часовому поясу при этом НЕ переписывается —
// оно живёт в `getPublishedVersionForStation`, и здесь только вызывается.
import { and, eq } from "drizzle-orm";
import { cache } from "react";

import type {
  Checklist,
  ChecklistVersion,
  Section,
  ShiftMode,
} from "@/blocks/data";
import {
  checklistVersions,
  countries,
  getDb,
  getShiftMode,
  listPublishedVersionsForStation,
  sectionsForMode,
  stations,
  stores,
} from "@/blocks/data";

import type { FillChoiceOption } from "./model";
import { isPlausibleCode } from "./params";
import { formatWindow } from "./view";

const UUID_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Открытая версия станции и минимум вокруг неё: названия пиццерии и станции. */
interface FillTargetReady {
  readonly kind: "ok";
  readonly version: ChecklistVersion;
  readonly checklist: Checklist;
  /**
   * Пункты, отфильтрованные действующим режимом смены (D056). Полные секции версии
   * НЕ отдаются наружу: сотруднику показывается ровно то, что от него сегодня ждут,
   * а факт сокращения хранит снимок заполнения, а не этот экран.
   */
  readonly sections: Section[];
  readonly mode: ShiftMode;
  /**
   * Выбирал ли кто-нибудь режим на сегодня. `false` — работает полная смена по
   * умолчанию, и шапка говорит об этом ровно так же: сокращение обязано быть
   * видимым действием, а не догадкой по числу пунктов на экране.
   */
  readonly modeChosen: boolean;
  readonly stationName: string;
  readonly storeName: string;
  /**
   * Часовой пояс пиццерии (`stores.timezone`): время на экране принадлежит кухне,
   * а не телефону. Отдаётся только на этом исходе — там, где код УЖЕ настоящий:
   * ответ на подобранный код по-прежнему не несёт о пиццерии ничего (D021).
   */
  readonly timeZone: string;
}

/**
 * Три исхода сканирования, и различаются ровно два из них:
 * · `unknown-code` — такой станции нет. Так же выглядит перевыпущенный код: старой
 *   строки после перевыпуска не остаётся, и это к лучшему — перебор не отличит промах
 *   от «код был, но отозван».
 * · `no-checklist` — станция есть, но сейчас ей заполнять нечего. Отдельное состояние
 *   потому, что сотруднику с настоящей наклейкой надо сказать правду: бежать к
 *   управляющему за новой наклейкой не нужно. Из данных не несёт ничего вовсе — ни
 *   названий, ни языка страны (см. `NO_CHECKLIST`).
 */
/**
 * Несколько чек-листов открыто одновременно — сотрудник выбирает.
 *
 * Так бывает не по недосмотру методиста: обход идёт весь день поверх открытия и
 * закрытия смены. Открывать первый по началу окна значило бы, что приём смены у
 * менеджера каждый день исчезает с 15:00 до 18:00 под дневным обходом — молча.
 */
interface FillTargetChoice {
  readonly kind: "choice";
  readonly options: readonly FillChoiceOption[];
  readonly stationName: string;
  readonly storeName: string;
}

export type FillTarget =
  | FillTargetReady
  | FillTargetChoice
  | { readonly kind: "unknown-code" }
  | { readonly kind: "no-checklist" };

const UNKNOWN_CODE = { kind: "unknown-code" } as const;

/**
 * «Заполнять нечего» не несёт о пиццерии НИЧЕГО — даже языка страны.
 *
 * Язык этой отбивки по-прежнему её (D122: «отбивки и сервисные сообщения также должны
 * быть на этом языке»), но берётся он не отсюда. Язык этой поверхности решается один раз
 * на запрос в `./document`, и его же объявляет документ; вторая копия того же факта в
 * ответе экрану была тем местом, откуда решение могли посчитать заново и разойтись
 * (T270). Публичная ссылка от этого отдаёт на одну строку меньше — ровно в духе D021.
 */
const NO_CHECKLIST = { kind: "no-checklist" } as const;

interface StationContext {
  readonly storeId: string;
  readonly stationName: string;
  readonly storeName: string;
  readonly countryLocale: string;
  readonly timeZone: string;
}

/**
 * Станция, её пиццерия и язык страны — ровно то, что попадёт на экран.
 *
 * Под `cache()`, потому что за этой строкой в одном запросе приходят двое: экран — за
 * содержимым, корневая разметка — за языком документа (T270). Без памяти на запрос это
 * были бы два одинаковых запроса в базу на каждое открытие экрана. Память живёт ровно
 * один проход рендера; вне рендера — в тестах — `cache` просто зовёт функцию, и
 * поведение остаётся прежним.
 */
const stationContext = cache(async function stationContext(
  code: string,
): Promise<StationContext | null> {
  const [row] = await getDb()
    .select({
      storeId: stores.id,
      stationName: stations.name,
      storeName: stores.name,
      countryLocale: countries.locale,
      timeZone: stores.timezone,
    })
    .from(stations)
    .innerJoin(stores, eq(stations.storeId, stores.id))
    .innerJoin(countries, eq(stores.countryId, countries.id))
    .where(eq(stations.code, code))
    .limit(1);

  return row ?? null;
});

/**
 * Язык страны этой станции — и ничего больше.
 *
 * Нужен корневой разметке, чтобы объявить язык ДОКУМЕНТА тем же, что язык текста на
 * экране (T270). Отдельная функция, а не второй запрос: за строкой станции она идёт в тот
 * же `stationContext`, то есть в единственный за запрос поход в базу. `null` — станции по
 * такому коду нет (или код заведомо не код), и тогда пиццерии нет, а значит нет и её
 * языка: подставлять за неё нечего.
 */
export async function stationCountryLocale(
  code: string,
): Promise<string | null> {
  if (!isPlausibleCode(code)) return null;
  return (await stationContext(code))?.countryLocale ?? null;
}

/**
 * Всё, что отдаётся по отсканированной ссылке. Ни истории заполнений, ни списка
 * чек-листов станции, ни сведений о пиццерии сверх названия: ссылка публичная,
 * и любая лишняя строка в ответе — это то, что узнаёт любой, кто её подобрал (D021).
 */
export async function loadFillTarget(
  code: string,
  at: Date,
  checklistId?: string,
): Promise<FillTarget> {
  if (!isPlausibleCode(code)) return UNKNOWN_CODE;

  const context = await stationContext(code);
  if (context === null) return UNKNOWN_CODE;

  const open = await listPublishedVersionsForStation(code, at);
  if (open.length === 0) return NO_CHECKLIST;

  // Выбранный чек-лист берётся только из списка открытых на ЭТОЙ станции: чужой
  // идентификатор не подставляет свой молча, а возвращает к выбору — иначе сотрудник
  // считал бы, что открыл тот, что назвал.
  const picked =
    checklistId === undefined
      ? undefined
      : open.find((entry) => entry.checklist.id === checklistId);

  const found = picked ?? (open.length === 1 ? open[0] : undefined);
  if (found === undefined) {
    return {
      kind: "choice",
      options: open.map((entry) => ({
        checklistId: entry.checklist.id,
        title: entry.checklist.title,
        window: formatWindow(
          entry.checklist.windowStart,
          entry.checklist.windowEnd,
        ),
      })),
      stationName: context.stationName,
      storeName: context.storeName,
    };
  }

  // Режим на сегодня, а если его никто не ставил — полная смена. Спрашивать первого
  // отсканировавшего нельзя: гейта на этом экране нет (D052), и первым подходит не
  // обязательно тот, кто знает график. Поэтому путь сотрудника остаётся прежним, а
  // сокращение делает тот, кто решает, — одним касанием по строке в шапке.
  const shift = await getShiftMode(context.storeId, at);
  const mode: ShiftMode = shift?.mode ?? "normal";

  const sections = sectionsForMode(found.version.sections, mode);
  // В этом режиме от станции сегодня не ждут ничего: честнее сказать «заполнять
  // нечего», чем открыть чек-лист без пунктов с активной кнопкой отправки.
  if (sections.length === 0) return NO_CHECKLIST;

  return {
    kind: "ok",
    version: found.version,
    checklist: found.checklist,
    sections,
    mode,
    modeChosen: shift?.chosen ?? false,
    stationName: context.stationName,
    storeName: context.storeName,
    timeZone: context.timeZone,
  };
}

/** Пиццерия станции по коду с наклейки: нужна, чтобы поставить ей режим смены. */
export async function storeIdForCode(code: string): Promise<string | null> {
  if (!isPlausibleCode(code)) return null;
  const context = await stationContext(code);
  return context?.storeId ?? null;
}

/** Версия, на которую пришло заполнение, — со снимком пунктов для проверки ответов. */
export interface StationVersion {
  readonly versionId: string;
  readonly stationId: string;
  /** Пиццерия станции: по ней читается действующий режим смены (D055). */
  readonly storeId: string;
  readonly sections: Section[];
}

/**
 * Версия по идентификатору — но только та, что заморожена на станции этого кода.
 *
 * Это и опора T041, и заслон: идентификатор версии приходит из браузера, то есть
 * от кого угодно. Без проверки принадлежности один живой код с наклейки позволял бы
 * писать заполнения в историю любой станции сети — `saveSubmission` выводит станцию
 * из версии и записал бы их туда, где никто не заполнял.
 *
 * Архивная версия проходит намеренно: сотрудник заполнял её, пока методист публиковал
 * следующую. Черновик не проходит — у него нет замороженной станции.
 */
export async function findStationVersion(
  code: string,
  versionId: string,
): Promise<StationVersion | null> {
  if (!isPlausibleCode(code)) return null;
  if (!UUID_PATTERN.test(versionId)) return null;

  const [row] = await getDb()
    .select({
      versionId: checklistVersions.id,
      stationId: stations.id,
      storeId: stations.storeId,
      sections: checklistVersions.sections,
    })
    .from(checklistVersions)
    .innerJoin(stations, eq(checklistVersions.stationId, stations.id))
    .where(and(eq(checklistVersions.id, versionId), eq(stations.code, code)))
    .limit(1);

  return row ?? null;
}
