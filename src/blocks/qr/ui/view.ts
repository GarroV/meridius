// Состояние экрана QR живёт в адресе — тем же правилом, что и справочник: ссылкой
// на лист конкретной пиццерии можно поделиться, а на экран планшета — открыть её на
// самом планшете и оставить навсегда.
//
// Всё, что приходит из адреса, разбирается строго: это ввод от кого угодно.
import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import type { CatalogErrorCode } from "@/blocks/catalog";

/**
 * Экран печати листа. Адрес раздела — один факт на весь продукт, и живёт он в
 * `core/admin-sections` (боковое меню читает его оттуда же): здесь раньше стояла
 * своя копия строкой, и она могла разъехаться с меню молча, как уже было с четырьмя
 * копиями списка разделов до T074.
 */
export const QR_PATH = ADMIN_SECTIONS.qr.path;
/** Полноэкранный QR для планшета станции. */
export const QR_SCREEN_PATH = `${QR_PATH}/screen`;
/** Опрос кода станции планшетом: отдаёт только код и время его выпуска. */
export const QR_CODE_PATH = `${QR_PATH}/code`;

/** Наклейка станции файлом (SVG) — «Скачать» рядом с кодом. */
const QR_STICKER_PATH = `${QR_PATH}/sticker`;

const STORE = "store";
const STATION = "station";

/**
 * Отказы, которые вообще может показать этот экран: перевыпуск кода умеет отказать
 * только этими двумя. Набор сужен намеренно — иначе в словарь пришлось бы завести
 * восемь текстов справочника, семь из которых здесь не показываются никогда.
 */
const QR_ERROR_CODES = [
  "notFound",
  "codeCollision",
] as const satisfies readonly CatalogErrorCode[];

export type QrErrorCode = (typeof QR_ERROR_CODES)[number];

export function isQrErrorCode(value: unknown): value is QrErrorCode {
  return (QR_ERROR_CODES as readonly string[]).includes(value as string);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface QrView {
  storeId?: string;
  stationId?: string;
  error?: QrErrorCode;
}

/**
 * Станция, найти которую можно за один запрос: справочник умеет отдавать станции
 * пиццерии, но не станцию по её собственному идентификатору. Поэтому и планшет, и
 * его опрос носят обе ссылки — иначе каждый опрос перебирал бы весь справочник.
 */
export interface StationRef {
  storeId: string;
  stationId: string;
}

/** Значения параметров адреса. Next отдаёт их именно так: строка, список или ничего. */
export type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  // Повторённый параметр (`?store=a&store=b`) — попытка подсунуть неожиданное:
  // берём первое значение, а не склеиваем.
  return Array.isArray(value) ? value[0] : value;
}

function uuidOrNothing(
  value: string | string[] | undefined,
): string | undefined {
  const raw = single(value);
  return raw !== undefined && UUID_PATTERN.test(raw) ? raw : undefined;
}

/** Разбирает адрес листа. Непонятное отбрасывается молча: это не ошибка, а мусор. */
export function parseQrView(params: SearchParams): QrView {
  const error = single(params["error"]);
  const view: QrView = {};

  const storeId = uuidOrNothing(params[STORE]);
  if (storeId !== undefined) view.storeId = storeId;

  const stationId = uuidOrNothing(params[STATION]);
  if (stationId !== undefined) view.stationId = stationId;

  if (isQrErrorCode(error)) view.error = error;

  return view;
}

/** Ссылка на станцию целиком или ничего: половина ссылки никуда не ведёт. */
export function parseStationRef(params: SearchParams): StationRef | null {
  const storeId = uuidOrNothing(params[STORE]);
  const stationId = uuidOrNothing(params[STATION]);

  return storeId === undefined || stationId === undefined
    ? null
    : { storeId, stationId };
}

function withParams(path: string, entries: [string, string | undefined][]) {
  const query = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value !== undefined && value !== "") query.set(key, value);
  }

  const search = query.toString();
  return search === "" ? path : `${path}?${search}`;
}

/** Адрес листа с заданным состоянием. Пустые значения в адрес не попадают. */
export function qrHref(view: QrView): string {
  return withParams(QR_PATH, [
    [STORE, view.storeId],
    [STATION, view.stationId],
    ["error", view.error],
  ]);
}

/** Адрес полноэкранного QR станции. */
export function qrScreenHref(ref: StationRef): string {
  return withParams(QR_SCREEN_PATH, [
    [STORE, ref.storeId],
    [STATION, ref.stationId],
  ]);
}

/** Адрес опроса кода станции. */
export function qrCodeHref(ref: StationRef): string {
  return withParams(QR_CODE_PATH, [
    [STORE, ref.storeId],
    [STATION, ref.stationId],
  ]);
}

/** Адрес файла наклейки станции. */
export function qrStickerHref(ref: StationRef): string {
  return withParams(QR_STICKER_PATH, [
    [STORE, ref.storeId],
    [STATION, ref.stationId],
  ]);
}
