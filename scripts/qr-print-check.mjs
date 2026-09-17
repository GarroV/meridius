#!/usr/bin/env node
// Проверка, что код читается С БУМАГИ, а не только с экрана (задача T035).
//
// Принтера у стройки нет, поэтому делается ближайшее честное: страница печати
// выводится браузером в PDF ровно так, как ушла бы на принтер (A4, поля 10 мм),
// PDF растрируется в том размере, в каком выйдет на листе (300 точек на дюйм),
// и код распознаётся из растра программно — тем же путём, что и камерой телефона.
//
// Запуск:
//   node scripts/qr-print-check.mjs --store <uuid> \
//        --password <ключ входа> [--url <адрес продукта>] [--out reports/qr-print]
//
// Без --url берётся адрес ЭТОЙ копии: порт спрашивается у общего источника
// (src/blocks/core/app-port.ts), а не назначается здесь числом.
//
// Нужен poppler (`pdftoppm`): без него проверка не выполняется, и это провал,
// а не пропуск — молча пропущенный гейт неотличим от пройденного.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { register } from "node:module";

import jsQR from "jsqr";
import { chromium } from "@playwright/test";

// Хук ставится ДО первого импорта из src/: без него Node не знает ни псевдонима `@/`,
// ни импортов без расширения, на которых написан код продукта.
register("./src-resolve-hook.mjs", import.meta.url);

// Порт этой копии — из общего источника (T200). Прежнее умолчание было числом,
// и числом ЧУЖОГО диапазона: проверка печати молча уходила снимать лист наклеек
// у соседа и печатала зелёное про его стенд.
const { appPort } = await import("../src/blocks/core/app-port.ts");

/** Разрешение растра: 300 точек на дюйм — обычная печать наклеек. */
const DPI = 300;
const MM_PER_INCH = 25.4;
/** Сторона плитки, которой обходится лист, и её перекрытие с соседней. */
const TILE = 900;
const TILE_STEP = 450;

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index + 1 >= process.argv.length) {
    if (fallback === undefined) {
      throw new Error(`не задан обязательный параметр --${name}`);
    }
    return fallback;
  }
  return process.argv[index + 1];
}

function requireTool(tool) {
  try {
    execFileSync("which", [tool], { stdio: "ignore" });
  } catch {
    throw new Error(
      `НЕТ ИНСТРУМЕНТА: ${tool}. Проверка не выполнена — это провал, а не пропуск.`,
    );
  }
}

/** Печатает страницу листа в PDF так же, как это сделал бы человек кнопкой «Печать». */
async function printSheetToPdf({ url, store, password, pdfPath }) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ locale: "ru-RU" });

    await page.goto(`${url}/admin/login`);
    await page.getByLabel("Пароль").fill(password);
    await page.getByTestId("login-submit").click();
    await page.getByTestId("admin-home").waitFor();

    await page.goto(`${url}/admin/qr?store=${store}`);
    await page.getByTestId("qr-sheet").waitFor();
    const stickers = await page.getByTestId("qr-sticker").count();

    // Поля задаёт сама страница (`@page { margin: 10mm }`), поэтому здесь их нет:
    // две настройки полей — верный способ получить не тот лист, что на экране.
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    return stickers;
  } finally {
    await browser.close();
  }
}

/** Читает серый растр из PGM (P5) — того формата, что отдаёт pdftoppm. */
function readPgm(file) {
  const raw = readFileSync(file);
  let offset = 0;
  const token = () => {
    while (offset < raw.length) {
      const char = String.fromCharCode(raw[offset]);
      if (char === "#") {
        while (offset < raw.length && raw[offset] !== 0x0a) offset += 1;
        continue;
      }
      if (!/\s/.test(char)) break;
      offset += 1;
    }
    let value = "";
    while (
      offset < raw.length &&
      !/\s/.test(String.fromCharCode(raw[offset]))
    ) {
      value += String.fromCharCode(raw[offset]);
      offset += 1;
    }
    return value;
  };

  const magic = token();
  if (magic !== "P5")
    throw new Error(`ожидался серый растр P5, пришёл ${magic}`);
  const width = Number(token());
  const height = Number(token());
  const max = Number(token());
  if (max !== 255) throw new Error(`неожиданная глубина серого: ${max}`);
  offset += 1;

  return { width, height, pixels: raw.subarray(offset) };
}

/** Ищет коды по всему листу плитками с перекрытием: где именно наклейка — неизвестно. */
function decodeAll({ width, height, pixels }) {
  const found = new Map();

  for (let top = 0; top < height; top += TILE_STEP) {
    for (let left = 0; left < width; left += TILE_STEP) {
      const tileWidth = Math.min(TILE, width - left);
      const tileHeight = Math.min(TILE, height - top);
      if (tileWidth < 100 || tileHeight < 100) continue;

      const data = new Uint8ClampedArray(tileWidth * tileHeight * 4);
      for (let y = 0; y < tileHeight; y += 1) {
        for (let x = 0; x < tileWidth; x += 1) {
          const gray = pixels[(top + y) * width + (left + x)];
          const at = (y * tileWidth + x) * 4;
          data[at] = gray;
          data[at + 1] = gray;
          data[at + 2] = gray;
          data[at + 3] = 255;
        }
      }

      const code = jsQR(data, tileWidth, tileHeight, {
        inversionAttempts: "dontInvert",
      });
      if (code === null) continue;

      const corners = code.location;
      // Сторона самого символа (без тихой зоны) в миллиметрах и размер одного
      // модуля: именно модуль определяет, прочитает ли код камера с руки.
      const sideMm =
        (Math.hypot(
          corners.topRightCorner.x - corners.topLeftCorner.x,
          corners.topRightCorner.y - corners.topLeftCorner.y,
        ) /
          DPI) *
        MM_PER_INCH;
      const modules = 17 + 4 * code.version;
      if (!found.has(code.data)) {
        found.set(code.data, {
          data: code.data,
          sideMm,
          moduleMm: sideMm / modules,
          version: code.version,
        });
      }
    }
  }

  return [...found.values()];
}

async function main() {
  requireTool("pdftoppm");

  const url = argument("url", `http://localhost:${String(appPort())}`);
  const store = argument("store");
  const password = argument("password", process.env["ADMIN_PASSWORD"]);
  const out = argument("out", "reports/qr-print");

  mkdirSync(out, { recursive: true });
  const pdfPath = path.join(out, "sheet.pdf");

  const stickers = await printSheetToPdf({ url, store, password, pdfPath });
  console.log(
    `Лист напечатан в PDF: ${pdfPath} · наклеек на экране: ${stickers}`,
  );

  execFileSync("pdftoppm", [
    "-r",
    String(DPI),
    "-gray",
    pdfPath,
    path.join(out, "page"),
  ]);
  const rasterPath = path.join(out, "page-1.pgm");
  const raster = readPgm(rasterPath);
  console.log(
    `Растр листа: ${raster.width}×${raster.height} точек при ${DPI} dpi ` +
      `(A4 — это ${Math.round((210 / MM_PER_INCH) * DPI)}×${Math.round((297 / MM_PER_INCH) * DPI)})`,
  );

  const codes = decodeAll(raster);
  for (const code of codes) {
    console.log(
      `  прочитано: ${code.data} · символ на бумаге ≈ ${code.sideMm.toFixed(1)} мм ` +
        `(версия ${String(code.version)}, модуль ≈ ${code.moduleMm.toFixed(2)} мм)`,
    );
  }

  writeFileSync(
    path.join(out, "codes.json"),
    JSON.stringify({ stickers, codes }, null, 2),
  );

  if (codes.length < stickers) {
    console.error(
      `\nПРОВАЛ: на листе ${stickers} наклеек, а с растра прочитано ${codes.length}.`,
    );
    process.exit(1);
  }
  console.log(
    `\nВСЕ ${codes.length} КОДОВ ПРОЧИТАНЫ С РАСТРА ПЕЧАТИ (${DPI} dpi, A4).`,
  );
}

await main();
