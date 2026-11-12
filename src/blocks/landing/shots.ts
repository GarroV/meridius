import { readFileSync } from "node:fs";
import path from "node:path";

import type { Locale } from "@/blocks/core/locale";
import { publicPath } from "@/blocks/core/base-path";

/**
 * Снимки посадочной: настоящие экраны демо-стенда (`npm run landing-shots`), по одному
 * файлу на язык. Имена — в одном месте: на них опираются и страница, и скрипт съёмки.
 */
export type ShotName =
  | "fill"
  | "editor"
  | "qr"
  | "tablet"
  | "stats"
  | "feed"
  | "network"
  | "templates";

/** Размеры файлов, `[ширина, высота]`: пишет скрипт съёмки, читает страница. */
export type ShotSizes = Readonly<Record<string, readonly [number, number]>>;

/** Папка снимков внутри `public/`, она же — адрес под корнем. */
export const SHOTS_DIR = "landing";
const SIZES_FILE = "sizes.json";

export function shotKey(name: ShotName, locale: Locale): string {
  return `${name}-${locale}`;
}

/** Адрес файла снимка под базовым путём площадки. */
export function shotSrc(name: ShotName, locale: Locale): string {
  return publicPath(`/${SHOTS_DIR}/${shotKey(name, locale)}.webp`);
}

function isSize(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => Number.isInteger(n) && (n as number) > 0)
  );
}

/**
 * Разбор `sizes.json`. Всё, что не пара положительных целых, отбрасывается: снимок без
 * размеров рисуется рамкой-заглушкой, а не картинкой с угаданной высотой, от которой
 * страница прыгает при загрузке.
 */
export function parseShotSizes(text: string): ShotSizes {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {};
  }
  const sizes: Record<string, readonly [number, number]> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSize(value)) sizes[key] = value;
  }
  return sizes;
}

/**
 * Размеры снятых снимков. Файла нет — пустой набор: до подъёма демо-стенда страница
 * обязана выглядеть пристойно, а не падать. Читается при каждом запросе: файл крошечный,
 * а пересъёмка не должна требовать пересборки.
 */
export function loadShotSizes(): ShotSizes {
  const file = path.join(process.cwd(), "public", SHOTS_DIR, SIZES_FILE);
  try {
    return parseShotSizes(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}
