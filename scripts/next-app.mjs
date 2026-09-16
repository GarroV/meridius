#!/usr/bin/env node
// Единственный способ поднять приложение: `npm run dev`, `npm run start` и `./scripts/up`
// зовут этот файл, и порт им всем считает один и тот же код.
//
//   node scripts/next-app.mjs dev            то же, что было `next dev`
//   node scripts/next-app.mjs start          то же, что было `next start`
//
// Зачем понадобился (T163, дефект #71). В package.json стояло `next dev --port 3100`
// литералом, а `./scripts/up` брал порт из .env — и пути запуска расходились МОЛЧА.
// Копия репозитория со своим диапазоном портов поднимала сервер на общем 3100 и дальше
// одно из двух: либо выбивала чужой стенд, либо цеплялась к чужому серверу и проверяла
// не свою сборку. Второе ловило людей дважды и оба раза выглядело как загадка в данных.
//
// Тот же класс уже был починен для сквозных сценариев (T111): там порт тоже перестали
// решать на месте. Разница была только в том, что путей запуска три, а источник — один.
//
// Флаг `--port` здесь НЕ принимается: он вернул бы ровно ту развилку, ради которой файл
// заведён. Порт задают там же, где его читают все остальные, — переменной `PORT` в
// окружении или в `.env` копии.
import { createRequire, register } from "node:module";
import { pathToFileURL } from "node:url";

register("./src-resolve-hook.mjs", import.meta.url);

const MODES = new Set(["dev", "start"]);

const mode = process.argv[2];
if (!MODES.has(mode)) {
  process.stderr.write(
    `Укажите режим: ${[...MODES].join(" или ")}.\n` +
      `  node scripts/next-app.mjs dev\n`,
  );
  process.exit(1);
}

const rest = process.argv.slice(3);
const pinned = rest.find((argument) => /^(--port(=|$)|-p(=|$))/.test(argument));
if (pinned !== undefined) {
  process.stderr.write(
    `Порт флагом не задаётся (${pinned}): он берётся из PORT в окружении или в .env копии,\n` +
      `одинаково для npm run dev, npm run start и ./scripts/up — см. src/blocks/core/app-port.ts.\n`,
  );
  process.exit(1);
}

const { appPort } = await import("../src/blocks/core/app-port.ts");
const port = appPort();

// Next запускается В ЭТОМ ЖЕ процессе, а не отдельным: на площадке продукт поднимает
// задача планировщика, и каждое лишнее звено между ней и сервером — ещё один способ
// остановить обёртку, оставив сервер жить. Его командная строка собирается здесь же,
// поэтому и разбирает её сам Next, а не наша догадка о его флагах.
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
process.argv = [
  process.argv[0],
  nextBin,
  mode,
  "--port",
  String(port),
  ...rest,
];

await import(pathToFileURL(nextBin).href);
