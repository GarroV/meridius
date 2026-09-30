// Состояние экрана справочника живёт в адресе, а не в памяти браузера: выбранная
// страна и пиццерия переживают перезагрузку, ссылкой можно поделиться, и весь экран
// остаётся серверным — формы работают даже с выключенным JavaScript.
//
// Всё, что приходит из адреса, — ввод от кого угодно, поэтому разбирается строго
// (принцип безопасности: проверка на границе), а не подставляется в запрос как есть.
import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

import { isCatalogErrorCode, type CatalogErrorCode } from "../errors";

/**
 * Адрес самого раздела. Берётся из `core/admin-sections`, а не пишется строкой:
 * тот же факт читает боковое меню, и до T119 здесь стояла своя копия `"/admin/catalog"`.
 * Разойтись копии могут только молча — у неактивного пункта меню и у разъехавшегося
 * адреса один и тот же симптом: человек никуда не попадает (тот же класс дубля, что
 * снял T116 в блоке `qr`).
 */
export const CATALOG_PATH = ADMIN_SECTIONS.catalog.path;

const FOCUS_KINDS = ["country", "store", "station"] as const;
/** Что показывает карточка под деревом: страна, пиццерия или станция. */
export type CatalogFocus = (typeof FOCUS_KINDS)[number];

const FORM_KINDS = ["country", "store", "station"] as const;
/** Какая форма создания раскрыта. Раскрытие — адрес, а не состояние компонента. */
export type CatalogFormKind = (typeof FORM_KINDS)[number];

const CONFIRM_KINDS = ["country", "store", "station", "reissue"] as const;
/**
 * Что подтверждает экран. Удаление без подтверждения невозможно по контракту; с
 * T260 то же верно для перевыпуска кода станции — он необратим ровно так же, как
 * удаление: все напечатанные наклейки станции перестают работать в ту же секунду.
 *
 * Страна попала сюда последней (T267): до неё контракт говорил одно, а кнопка
 * «Удалить страну» делала другое — сносила молча, с одного нажатия. Пустая страна
 * дёшева (название и язык заводятся заново), но правило экрана «удаление всегда
 * спрашивает» дороже этой дешевизны: человек, у которого оно однажды не сработало,
 * перестаёт на него полагаться вообще.
 */
export type CatalogConfirmKind = (typeof CONFIRM_KINDS)[number];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CatalogView {
  countryId?: string;
  storeId?: string;
  stationId?: string;
  focus?: CatalogFocus;
  create?: CatalogFormKind;
  confirm?: CatalogConfirmKind;
  error?: CatalogErrorCode;
}

/** Значения параметров адреса. Next отдаёт их именно так: строка, список или ничего. */
export type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  // Повторённый параметр (`?country=a&country=b`) — попытка подсунуть неожиданное:
  // берём первое значение, а не склеиваем.
  return Array.isArray(value) ? value[0] : value;
}

function uuidOrNothing(
  value: string | string[] | undefined,
): string | undefined {
  const raw = single(value);
  return raw !== undefined && UUID_PATTERN.test(raw) ? raw : undefined;
}

function oneOf<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T | undefined {
  const raw = single(value);
  return allowed.find((item) => item === raw);
}

/** Разбирает адрес экрана. Всё непонятное отбрасывается молча: это не ошибка, а мусор. */
export function parseCatalogView(params: SearchParams): CatalogView {
  const error = single(params["error"]);

  return {
    countryId: uuidOrNothing(params["country"]),
    storeId: uuidOrNothing(params["store"]),
    stationId: uuidOrNothing(params["station"]),
    focus: oneOf(params["focus"], FOCUS_KINDS),
    create: oneOf(params["create"], FORM_KINDS),
    confirm: oneOf(params["confirm"], CONFIRM_KINDS),
    error: isCatalogErrorCode(error) ? error : undefined,
  };
}

/** Адрес экрана с заданным состоянием. Пустые значения в адрес не попадают. */
export function catalogHref(view: CatalogView): string {
  const query = new URLSearchParams();
  const entries: [string, string | undefined][] = [
    ["country", view.countryId],
    ["store", view.storeId],
    ["station", view.stationId],
    ["focus", view.focus],
    ["create", view.create],
    ["confirm", view.confirm],
    ["error", view.error],
  ];

  for (const [key, value] of entries) {
    if (value !== undefined && value !== "") query.set(key, value);
  }

  const search = query.toString();
  return search === "" ? CATALOG_PATH : `${CATALOG_PATH}?${search}`;
}

/**
 * Куда ведёт кнопка «QR» из справочника: пиццерия целиком или одна её станция.
 *
 * `storeId` — `null`, когда пиццерия не выбрана: адрес тогда ведёт в сам раздел, где
 * экран QR предлагает выбрать пиццерию. Неактивной кнопки в кабинете не остаётся ни в
 * одном состоянии — обещание кнопки выполняется всегда (T107).
 */
export interface QrTarget {
  readonly storeId: string | null;
  /** Станция: с ней ссылка ведёт на лист наклейки именно этой станции. */
  readonly stationId?: string;
}

/**
 * Лист наклеек раздела «Станции» и имя его параметра. Справочнику нельзя импортировать
 * блок `stations` (он сам читает справочник, `.dependency-cruiser.cjs`), поэтому
 * совпадение адреса — договорённость двух блоков; его держит `e2e/catalog-qr.spec.ts`
 * настоящим переходом.
 */
const STICKERS_PATH = `${ADMIN_SECTIONS.stations.path}/stickers`;
const STICKERS_STATION_PARAM = "stationIds";

/**
 * Адрес наклеек из справочника.
 *
 * Станция — сразу лист её наклейки (T341). Кнопка называется «QR» и стоит в строке
 * станции: человек шёл печатать наклейку. Прежний адрес `/admin/qr?station=` после T312
 * уводит на карточку станции, где QR нет, — и цепочка критерия 3 рвалась на лишнем
 * шаге. Тот же лист нужен и после перевыпуска кода в справочнике: старая наклейка
 * больше не работает, печатать надо новую.
 *
 * Пиццерия без станции — старым адресом раздела QR: он сам уводит на лист наклеек всех
 * её станций (`stations/ui/legacy-routes.ts`), а список станций знает он, не ссылка.
 *
 * Почему не берётся готовый `qrHref` из `blocks/qr/ui/view.ts`: границы модулей
 * запрещают справочнику импортировать блок `qr` — это блок `qr` читает справочник.
 * Сам адрес раздела лежит в `core/admin-sections`, доступном обоим.
 */
export function qrStationsHref(target: QrTarget): string {
  if (target.stationId !== undefined && target.stationId !== "") {
    const query = new URLSearchParams({
      [STICKERS_STATION_PARAM]: target.stationId,
    });
    return `${STICKERS_PATH}?${query.toString()}`;
  }

  const path = ADMIN_SECTIONS.qr.path;
  if (target.storeId === null) return path;
  return `${path}?${new URLSearchParams({ store: target.storeId }).toString()}`;
}
