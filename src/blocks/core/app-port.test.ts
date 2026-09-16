// Единственный источник порта приложения (T163, issue #71). `npm run dev` и
// `npm run start` были прибиты к 3100 литералом в package.json и переменную PORT
// игнорировали, при этом scripts/up её уважал — блок-агент со своим диапазоном
// портов получал сервер на общем 3100 и проверял чужую сборку. Тесты ниже описывают
// поведение общего источника (appPort) и стерегут все три пути запуска, которые
// обязаны брать порт из него, а не заводить свой литерал заново.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { repositoryRoot } from "./repo-copy";

const REPO_ROOT = repositoryRoot();

/**
 * Загрузка `appPort` — динамическая и по требованию, а не статическим импортом
 * наверху файла. Модуля ещё нет: статический импорт обрушил бы сбором всего файла
 * разом, и случаи 18–21 (они модуль не используют, читают файлы путей запуска
 * напрямую) падали бы по чужой причине — недостижимым импортом, а не по своей
 * логике. Так падение каждой группы говорит именно о своей причине.
 */
async function loadAppPort(): Promise<
  (
    environment?: Readonly<Record<string, string | undefined>>,
    root?: string,
  ) => number
> {
  const module = await import("./app-port");
  return module.appPort;
}

// Регулярка вида «слово PORT, а дальше на той же строке 4-5-значное число» — то, чем
// сторожа (случаи 18–21) ловят числовое умолчание рядом с именем переменной. Не
// матчится на DB_PORT/E2E_PORT: подчёркивание — словесный символ, границы слова между
// ним и PORT нет.
const PORT_WORD_WITH_NUMBER = /\bPORT\b[^\n]*\b\d{4,5}\b/;

let tempDirs: string[] = [];

/** Временная копия `root`: только .env, если он нужен случаю. Убирается в afterEach. */
function makeTempRoot(envContent?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "meridius-app-port-"));
  tempDirs.push(dir);
  if (envContent !== undefined) {
    writeFileSync(join(dir, ".env"), envContent, "utf8");
  }
  return dir;
}

/** Текст сообщения отказа. Бросает, если функция не бросила — так падение видно сразу. */
function messageOfThrow(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("ожидался throw, но appPort вернула значение");
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("откуда берётся порт", () => {
  test("порт из окружения процесса, когда .env рядом нет", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot();
    expect(appPort({ PORT: "3310" }, root)).toBe(3310);
  });

  test("порт из .env копии, когда в окружении его нет", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot("PORT=3410\n");
    expect(appPort({}, root)).toBe(3410);
  });

  test("окружение сильнее .env", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot("PORT=3410\n");
    expect(appPort({ PORT: "3310" }, root)).toBe(3310);
  });

  test("не задан нигде — умолчание 3100", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot();
    expect(appPort({}, root)).toBe(3100);
  });

  test(".env есть, но PORT в нём нет — умолчание 3100", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot("OTHER=1\n");
    expect(appPort({}, root)).toBe(3100);
  });

  test("закомментированная строка «# PORT=3999» не считается", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot("# PORT=3999\n");
    expect(appPort({}, root)).toBe(3100);
  });

  test("последнее присвоение в .env сильнее раннего", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot("PORT=3410\nPORT=3420\n");
    expect(appPort({}, root)).toBe(3420);
  });

  test("ведущие пробелы перед ключом в .env не мешают разбору", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot("  PORT=3410\n");
    expect(appPort({}, root)).toBe(3410);
  });

  test("значение в кавычках — кавычки снимаются", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot('PORT="3410"\n');
    expect(appPort({}, root)).toBe(3410);
  });

  test("пустое значение в окружении не считается заданным — берётся .env", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot("PORT=3410\n");
    expect(appPort({ PORT: "" }, root)).toBe(3410);
  });

  test("пустое значение в .env — умолчание 3100", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot("PORT=\n");
    expect(appPort({}, root)).toBe(3100);
  });

  test("DB_PORT в .env порт приложения не задаёт", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot("DB_PORT=5462\n");
    expect(appPort({}, root)).toBe(3100);
  });
});

describe("отказ вместо тихого умолчания", () => {
  test("мусор в окружении — отказ называет PORT, значение и источник", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot();
    const message = messageOfThrow(() => appPort({ PORT: "abc" }, root));
    expect(message).toContain("PORT");
    expect(message).toContain("abc");
    // Формулировка источника варьируется, но упомянуть окружение процесса обязана —
    // не молча взятое умолчание, а названная причина отказа.
    expect(message).toMatch(/окружен/i);
  });

  test("мусор в .env — отказ называет путь к .env", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot("PORT=abc\n");
    const message = messageOfThrow(() => appPort({}, root));
    expect(message).toContain(join(root, ".env"));
  });

  test("ноль — отказ, а не тихий откат к умолчанию", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot();
    expect(() => appPort({ PORT: "0" }, root)).toThrow();
  });

  test("порт больше 65535 — отказ", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot();
    expect(() => appPort({ PORT: "70000" }, root)).toThrow();
  });

  test("дробное значение — отказ", async () => {
    const appPort = await loadAppPort();
    const root = makeTempRoot();
    expect(() => appPort({ PORT: "3310.5" }, root)).toThrow();
  });
});

describe("пути запуска берут порт из одного источника", () => {
  test("package.json: ни один scripts не называет порт литералом", () => {
    const packageJson = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const scripts = packageJson.scripts ?? {};
    const namesPort = /--port(?:[= ]|$)|(?:^|\s)-p\s+\d/;

    for (const [name, command] of Object.entries(scripts)) {
      expect(namesPort.test(command), `scripts.${name} = "${command}"`).toBe(
        false,
      );
      // Флаг — не единственный способ прибить порт: `PORT=3100 next dev` обходит
      // проверку выше и расходится с общим источником ровно так же.
      expect(command, `scripts.${name}`).not.toMatch(PORT_WORD_WITH_NUMBER);
    }
  });

  test("package.json: dev и start идут через общий scripts/next-app.mjs", () => {
    const packageJson = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["dev"]).toContain("scripts/next-app.mjs");
    expect(packageJson.scripts?.["start"]).toContain("scripts/next-app.mjs");
  });

  test("scripts/up: без своего --port и без числового умолчания у PORT, источник общий", () => {
    const content = readFileSync(join(REPO_ROOT, "scripts", "up"), "utf8");
    // Только строки, не являющиеся целиком комментарием: пояснения в scripts/up
    // законно упоминают номера портов, и сторож не обязан спотыкаться об них.
    const codeText = content
      .split("\n")
      .filter((line) => !/^\s*#/.test(line))
      .join("\n");

    // "--port" с переменной ("--port \"$PORT\"") — законно, это как раз передача из
    // общего источника дальше в `next start`; под запретом только число рядом с флагом.
    expect(codeText).not.toMatch(/--port(?:=|\s+)\d/);
    expect(codeText).not.toMatch(PORT_WORD_WITH_NUMBER);
    expect(content).toContain("scripts/app-port.mjs");
  });

  test("playwright.config.ts: без числового умолчания у PORT, источник общий", () => {
    const content = readFileSync(
      join(REPO_ROOT, "playwright.config.ts"),
      "utf8",
    );
    // Комментарий — строка, начинающаяся с //, * или /*: в JSDoc-блоках этого файла
    // номера портов тоже упоминаются законно, как пояснение, а не как источник.
    const codeText = content
      .split("\n")
      .filter((line) => !/^\s*(?:\/\/|\/\*|\*)/.test(line.trim()))
      .join("\n");

    expect(codeText).not.toMatch(PORT_WORD_WITH_NUMBER);
    expect(content).toContain("./src/blocks/core/app-port");

    // Проверки выше файл целиком не закрывают, и это выяснено фактом, а не рассуждением:
    // возвращённый литерал (`? 3101` вместо `appPort() + 1`) оставлял сторожа ЗЕЛЁНЫМ —
    // число стоит на своей строке, без слова PORT рядом, а импорт общего источника
    // остаётся в файле нетронутым. Поэтому смотрим на само выражение порта: в нём не
    // может быть числа длиннее одного знака (единственное законное — смещение `+ 1`),
    // и оно обязано звать общий источник.
    const assignment = /const PORT\s*=([\S\s]*?);/.exec(codeText);
    expect(assignment, "не найдено присвоение const PORT").not.toBeNull();
    const expression = assignment?.[1] ?? "";
    expect(expression).not.toMatch(/\d{2,}/);
    expect(expression).toContain("appPort()");
  });
});
