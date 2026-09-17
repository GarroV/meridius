// Порт приложения этой копии репозитория — ЕДИНСТВЕННЫЙ источник для всех путей запуска.
//
// Откуда взялась задача (T163, дефект #71). Путей запуска три: `npm run dev`,
// `npm run start` и `./scripts/up`. Первые два были прибиты к 3100 литералом прямо в
// package.json и переменную `PORT` не читали вовсе, третий её уважал. Расходились они
// МОЛЧА: копия репозитория со своим диапазоном портов просила свой порт, получала общий
// 3100 — и дальше одно из двух. Либо выбивала стенд соседа, либо, если сервер там уже
// стоял, цеплялась к чужому и проверяла чужую сборку, печатая при этом зелёное. Второе
// ловило людей дважды, и оба раза причину искали в данных, а не в порте.
//
// Ровно тот же класс уже был починен для сквозных сценариев (T111, issue #21): порт
// перестали решать на месте. Разница только в числе путей — а лечится это одинаково:
// решение о порте принимается здесь, а все пути запуска его спрашивают.
//
// Кто спрашивает:
//   • `scripts/next-app.mjs` — общий запускатель `npm run dev` и `npm run start`;
//   • `scripts/app-port.mjs` — обёртка для оболочки, её зовёт `./scripts/up`;
//   • `playwright.config.ts` — порт прогона считается соседним к порту копии.
//
// Сторож от возврата литерала — в `app-port.test.ts`: он читает сами пути запуска и
// краснеет, если число порта вернулось в любой из них. Без сторожа правка держалась бы
// на памяти следующего автора, а именно она здесь и подвела.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { repositoryRoot } from "./repo-copy";

/**
 * Умолчание. Живёт здесь и только здесь: это то самое число, которое раньше стояло
 * в package.json, в `scripts/up` и в конфигурации прогона тремя отдельными копиями.
 */
const DEFAULT_APP_PORT = 3100;

/** Файл настроек копии. В git не попадает, поэтому у каждой копии он свой. */
const SETTINGS_FILE = ".env";

const MAX_PORT = 65_535;

/**
 * Присвоение `PORT` в файле настроек. Ключ сравнивается целиком, поэтому `DB_PORT`,
 * `E2E_PORT` и `PORTAL` сюда не попадают — а они в этом файле соседи по строкам.
 * Строка-комментарий не подходит под шаблон: у неё первый непробельный знак `#`.
 */
const SETTING_LINE = /^[ \t]*PORT[ \t]*=(.*)$/gm;

/** Значение в кавычках — обычная запись для файлов окружения; кавычки не часть порта. */
const QUOTED = /^(["'])(.*)\1$/;

function cleaned(value: string): string {
  const trimmed = value.trim();
  const quoted = QUOTED.exec(trimmed);
  return quoted?.[2] ?? trimmed;
}

/**
 * Значение `PORT` из текста настроек. Присвоений может быть несколько — сильнее
 * ПОСЛЕДНЕЕ: `scripts/up` дописывает значения в конец файла, и первое из них было бы
 * тем самым устаревшим значением, которое уже заменили.
 */
function settingValue(text: string): string | undefined {
  const found = [...text.matchAll(SETTING_LINE)];
  const last = found.at(-1);
  return last === undefined ? undefined : cleaned(last[1] ?? "");
}

/**
 * Число порта или отказ. Отказ, а не откат к умолчанию, — сознательно: тихо взятый
 * общий порт и есть дефект, который здесь чинится, и выглядит он как работающий стенд.
 */
function portNumber(raw: string, source: string): number {
  const port = /^\d{1,5}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(
      `PORT=${raw} (${source}) — не порт. Ожидается целое от 1 до ${String(MAX_PORT)}. ` +
        `Умолчание здесь не подставляется нарочно: молча взятый общий порт выглядит ` +
        `как рабочий стенд, а проверяет чужую сборку.`,
    );
  }
  return port;
}

/**
 * Порт приложения этой копии.
 *
 * Источники, от сильного к слабому: `PORT` в окружении процесса, `PORT` в `.env` рядом
 * с `package.json`, умолчание. Пустое значение считается незаданным — переменные
 * окружения слишком легко экспортируются пустыми, чтобы считать это выбором.
 *
 * @param environment окружение процесса
 * @param root корень копии репозитория; считается от собственного модуля, а НЕ от
 * рабочего каталога: у прогона, хука `pre-push` и запуска из подкаталога он разный,
 * а копия — нет.
 */
export function appPort(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  root: string = repositoryRoot(),
): number {
  const fromEnvironment = cleaned(environment["PORT"] ?? "");
  if (fromEnvironment !== "") {
    return portNumber(fromEnvironment, "окружение процесса");
  }

  const settingsPath = join(root, SETTINGS_FILE);
  // Настроек рядом нет (свежий клон, CI) — это не ошибка, просто берём умолчание.
  // Но если файл есть и нечитаем, молчать не о чем: читаем без try/catch.
  if (existsSync(settingsPath)) {
    const fromSettings = settingValue(readFileSync(settingsPath, "utf8"));
    if (fromSettings !== undefined && fromSettings !== "") {
      return portNumber(fromSettings, settingsPath);
    }
  }

  return DEFAULT_APP_PORT;
}
