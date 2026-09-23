import { execFileSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

import {
  E2E_ADMIN_PASSWORD_HASH,
  E2E_DEVICE_SESSION_SECRET,
  E2E_SESSION_SECRET,
} from "./e2e/admin-credentials";
import { e2eDatabaseUrl } from "./e2e/database";
import { E2E_PUBLIC_BASE_URL } from "./e2e/public-base-url";
import { appPort } from "./src/blocks/core/app-port";

// Порт прогона — соседний к порту самой копии, а не общий.
//
// Параллельные копии репозитория (стройка блоками) иначе делят один порт: копия знает
// свой порт из настроек, а прогон об этом не спрашивал и уходил на общий — вне
// выданных блокам диапазонов. Два блока с полным прогоном одновременно перехватывали
// сервер друг у друга, и проигравший краснел по чужой причине (T111, issue #21).
//
// Порт копии здесь БОЛЬШЕ НЕ РАЗБИРАЕТСЯ: своя копия чтения настроек стояла тут же
// и была третьей по счёту в проекте (T163). Спрашиваем общий источник — тот же, из которого
// берут порт `npm run dev`, `npm run start` и `./scripts/up`. Умолчание за ним же:
// прежнее — это порт приложения по умолчанию плюс один, таким оно и осталось.
//
// `E2E_PORT` по-прежнему сильнее всего: им прогон уводят с любого занятого порта.
const explicitPort = process.env["E2E_PORT"];
const PORT =
  explicitPort === undefined || explicitPort.trim() === ""
    ? appPort() + 1
    : Number(explicitPort);
const BASE_URL = `http://localhost:${String(PORT)}`;

/**
 * Сервер прогона НЕ переиспользуется никогда — ни локально, ни в CI.
 *
 * Раньше здесь стояло `reuseExistingServer: !process.env["CI"]`: если по адресу уже
 * кто-то отвечал, Playwright молча брал его и печатал зелёный результат по чужому коду.
 * Это тихий отказ гейта — худший вид отказа, потому что выглядит он как пройденная проверка.
 *
 * Почему не «переиспользуем, когда сервер свой»: проверить это дёшево нельзя, а
 * правдоподобная проверка опаснее её отсутствия. Опознание владельца по рабочему каталогу
 * процесса (`lsof -d cwd`) было написано и провалено фактом: посторонний
 * `python3 -m http.server`, запущенный из корня копии, признавался своим, и прогон уходил
 * в него. И даже настоящий `next start` этой копии ничего не доказывает: он мог быть
 * поднят с прошлой сборки, то есть проверялся бы код, которого в дереве уже нет.
 *
 * Единственный сервер, про который точно известно, из какого кода он собран, — поднятый
 * этим же прогоном. Сборка проекта занимает секунды, поэтому цена честности здесь мала.
 */
const REUSE_EXISTING_SERVER = false;

/** pid слушателя порта или `undefined`. Только ради понятного сообщения — гейтом не является. */
function listenerPid(port: number): string | undefined {
  try {
    const found = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${String(port)}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return found === "" ? undefined : found.split("\n")[0];
  } catch {
    // lsof нет или он упал — молчим: занятость порта всё равно поймает сам Playwright.
    return undefined;
  }
}

// Playwright перечитывает конфигурацию в каждом воркере — уже после того, как сам поднял
// сервер. Там порт занят всегда и по делу, поэтому предупреждение печатает только главный
// процесс: воркеры помечены переменной TEST_WORKER_INDEX.
const isWorkerProcess = process.env["TEST_WORKER_INDEX"] !== undefined;
const occupiedBy = isWorkerProcess ? undefined : listenerPid(PORT);
if (occupiedBy !== undefined) {
  // Playwright откажется сам, но его сообщение не называет ни того, кто занял порт,
  // ни того, чем порт сдвинуть. Без этих двух строк отказ выглядит загадочно.
  console.error(
    `\n[playwright] Порт ${String(PORT)} уже слушает процесс ${occupiedBy}. ` +
      `Прогон не станет его переиспользовать: чей это сервер и из какого он кода — неизвестно, ` +
      `а зелёный результат по чужой сборке хуже красного.\n` +
      `Освободите порт или задайте свой: E2E_PORT=<порт> npm run e2e\n`,
  );
}

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  reporter: [
    ["list"],
    ["junit", { outputFile: "reports/playwright.junit.xml" }],
  ],
  use: {
    baseURL: BASE_URL,
    // Тема фиксирована: токены дизайн-системы отдают в тёмной теме другой акцент.
    colorScheme: "light",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // База прогона готовится один раз и с нуля: экраны админки читают и пишут настоящие
  // данные, а зелёный прогон на чужих остатках ничего не доказывает.
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    // Продакшен-сборка, а не dev: Next 16 не поднимает второй dev-сервер на тот же каталог,
    // и проверять всё равно правильнее то, что уедет на площадку.
    command: `npx next build && npx next start --port ${String(PORT)}`,
    url: BASE_URL,
    reuseExistingServer: REUSE_EXISTING_SERVER,
    timeout: 120_000,
    // Вход в админку читает эти переменные. Значения тестовые и лежат рядом в e2e/:
    // рабочие живут в .env, который в git не попадает.
    env: {
      ADMIN_PASSWORD_HASH: E2E_ADMIN_PASSWORD_HASH,
      SESSION_SECRET: E2E_SESSION_SECRET,
      // Подпись куки планшета: без неё продукт не стартует вовсе, и привязанная
      // вкладка отвечала бы пятисоткой вместо чек-листа.
      DEVICE_SESSION_SECRET: E2E_DEVICE_SESSION_SECRET,
      // Своя база прогона: рабочую сносила бы подготовка, а тестовую посреди прогона
      // пересоздаёт vitest. Адрес считается сам и в свежем клоне без .env тоже.
      DATABASE_URL: e2eDatabaseUrl(),
      // Адрес, который попадает внутрь QR-кода станции. Задан нарочно не тем, на
      // котором поднят сервер: так видно, что код берёт его из окружения площадки.
      PUBLIC_BASE_URL: E2E_PUBLIC_BASE_URL,
    },
  },
});
