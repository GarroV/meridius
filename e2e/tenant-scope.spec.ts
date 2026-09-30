import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

import { hashPassword } from "../src/blocks/auth/password";
import { adminRoutes } from "./admin-routes";
import { e2eDatabaseUrl } from "./database";

/**
 * Область видимости тенанта на ВЕСЬ кабинет (D145): партнёр, вошедший своей учёткой, не
 * получает чужую страну ни с одного маршрута кабинета.
 *
 * Маршруты берутся перебором файлов (`admin-routes.ts`), а не записанным однажды
 * списком: у каждого маршрута здесь обязан быть свой способ спросить его про чужую
 * страну. Новый экран без такого способа роняет сценарий «каждый маршрут кабинета
 * проверен» с его адресом — забыть навесить область на новый экран не получится молча.
 *
 * Проверка — по телу ответа целиком, вместе с данными для клиентских компонентов: имя
 * чужой страны, пиццерии, станции, код станции и название чужого чек-листа не должны
 * встретиться нигде. Рядом стоит обратная проверка — своё на тех же экранах видно, иначе
 * пустой экран сошёл бы за изоляцию.
 */

const PASSWORD = "e2e-пароль-партнёра-длинный";

interface Side {
  readonly countryId: string;
  readonly countryName: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly stationId: string;
  readonly stationName: string;
  readonly stationCode: string;
  readonly checklistId: string;
  readonly checklistTitle: string;
  readonly submissionId: string;
  readonly deviceId: string;
}

interface World {
  readonly mine: Side;
  readonly theirs: Side;
  /** Чек-лист соседнего партнёра без станции: ни в какой стране он не лежит. */
  readonly strangerChecklistId: string;
  readonly strangerChecklistTitle: string;
  readonly login: string;
}

const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

function stationCode(): string {
  return Array.from(
    { length: 10 },
    () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)] ?? "z",
  ).join("");
}

async function one(
  pool: Pool,
  text: string,
  values: readonly unknown[],
): Promise<string> {
  const result = await pool.query<{ id: string }>(text, [...values]);
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error(`Не вставилось: ${text}`);
  return id;
}

async function seedSide(pool: Pool, label: string): Promise<Side> {
  const countryName = `Страна-${label}`;
  const storeName = `Пиццерия-${label}`;
  const stationName = `Станция-${label}`;
  const checklistTitle = `Чек-лист-${label}`;
  const code = stationCode();

  const countryId = await one(
    pool,
    "insert into countries (name, locale) values ($1, 'ru') returning id",
    [countryName],
  );
  const storeId = await one(
    pool,
    "insert into stores (country_id, name, timezone) values ($1, $2, 'UTC') returning id",
    [countryId, storeName],
  );
  const stationId = await one(
    pool,
    "insert into stations (store_id, name, code) values ($1, $2, $3) returning id",
    [storeId, stationName, code],
  );
  const checklistId = await one(
    pool,
    `insert into checklists (station_id, title, window_start, window_end, tenant_id)
     values ($1, $2, '00:00', '23:59', (select id from tenants where kind = 'hq')) returning id`,
    [stationId, JSON.stringify({ ru: checklistTitle, en: checklistTitle })],
  );
  const versionId = await one(
    pool,
    `insert into checklist_versions
       (checklist_id, version_number, status, station_id, sections, published_at)
     values ($1, 1, 'published', $2, '[]', now()) returning id`,
    [checklistId, stationId],
  );
  const submissionId = await one(
    pool,
    `insert into submissions (version_id, station_id, snapshot, answers, started_at)
     values ($1, $2, '[]', '[]', now()) returning id`,
    [versionId, stationId],
  );
  const deviceId = await one(
    pool,
    "insert into devices (station_id) values ($1) returning id",
    [stationId],
  );

  return {
    countryId,
    countryName,
    storeId,
    storeName,
    stationId,
    stationName,
    stationCode: code,
    checklistId,
    checklistTitle,
    submissionId,
    deviceId,
  };
}

async function seedWorld(): Promise<World> {
  const label = randomUUID().slice(0, 8);
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });
  try {
    const mine = await seedSide(pool, `своя-${label}`);
    const theirs = await seedSide(pool, `чужая-${label}`);

    const partnerId = await one(
      pool,
      "insert into tenants (kind, name) values ('partner', $1) returning id",
      [`Партнёр-${label}`],
    );
    await pool.query(
      "insert into tenant_countries (tenant_id, country_id) values ($1, $2)",
      [partnerId, mine.countryId],
    );
    const strangerId = await one(
      pool,
      "insert into tenants (kind, name) values ('partner', $1) returning id",
      [`Сосед-${label}`],
    );
    await pool.query(
      "insert into tenant_countries (tenant_id, country_id) values ($1, $2)",
      [strangerId, theirs.countryId],
    );
    const strangerChecklistTitle = `Чек-лист-соседа-${label}`;
    const strangerChecklistId = await one(
      pool,
      `insert into checklists (station_id, title, window_start, window_end, tenant_id)
       values (null, $1, '00:00', '23:59', $2) returning id`,
      [
        JSON.stringify({
          ru: strangerChecklistTitle,
          en: strangerChecklistTitle,
        }),
        strangerId,
      ],
    );

    const login = `e2e-p-${label}`;
    await pool.query(
      "insert into accounts (tenant_id, login, password_hash) values ($1, $2, $3)",
      [
        partnerId,
        login,
        await hashPassword(PASSWORD, {
          cost: 1024,
          blockSize: 8,
          parallelization: 1,
        }),
      ],
    );

    return {
      mine,
      theirs,
      strangerChecklistId,
      strangerChecklistTitle,
      login,
    };
  } finally {
    await pool.end();
  }
}

async function signInAs(page: Page, login: string): Promise<void> {
  await page.goto("/admin/login");
  await page.locator('input[name="login"]').fill(login);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page).not.toHaveURL(/\/admin\/login/);
}

/** Как спросить маршрут про чужую страну и что обязано быть видно из своей. */
interface Probe {
  /** Адреса, по которым маршрут спрашивается с чужими идентификаторами. */
  readonly foreign: (world: World) => readonly string[];
  /** Адрес, на котором своё обязано быть видно, и что именно. */
  readonly own?: (world: World) => { url: string; text: string };
}

const params = (entries: Record<string, string>) =>
  `?${new URLSearchParams(entries).toString()}`;

const PROBES: Record<string, Probe> = {
  // Главная (T315) показывает «моё»: имя своего чек-листа видно (строкой чек-листов или
  // заполнений — оба несут его, проверено порчей обоих), чужие имена — нет.
  "/admin": {
    foreign: () => ["/admin"],
    own: ({ mine }) => ({ url: "/admin", text: mine.checklistTitle }),
  },
  "/admin/[...unknown]": { foreign: () => ["/admin/sample"] },
  "/admin/catalog": {
    foreign: ({ theirs }) => [
      "/admin/catalog",
      `/admin/catalog${params({ country: theirs.countryId })}`,
      `/admin/catalog${params({ country: theirs.countryId, store: theirs.storeId, station: theirs.stationId, focus: "station" })}`,
    ],
    own: ({ mine }) => ({ url: "/admin/catalog", text: mine.countryName }),
  },
  "/admin/checklists": {
    foreign: () => ["/admin/checklists"],
    own: ({ mine }) => ({
      url: "/admin/checklists",
      text: mine.checklistTitle,
    }),
  },
  "/admin/checklists/new": { foreign: () => ["/admin/checklists/new"] },
  "/admin/checklists/[id]": {
    foreign: (world) => [
      `/admin/checklists/${world.theirs.checklistId}`,
      `/admin/checklists/${world.strangerChecklistId}`,
    ],
  },
  "/admin/checklists/[id]/delete": {
    foreign: (world) => [
      `/admin/checklists/${world.theirs.checklistId}/delete`,
      `/admin/checklists/${world.strangerChecklistId}/delete`,
    ],
  },
  "/admin/checklists/[id]/preview": {
    foreign: (world) => [
      `/admin/checklists/${world.theirs.checklistId}/preview`,
      `/admin/checklists/${world.strangerChecklistId}/preview`,
    ],
  },
  "/admin/checklists/[id]/template-update": {
    foreign: (world) => [
      `/admin/checklists/${world.theirs.checklistId}/template-update`,
    ],
  },
  // Бывший раздел «Устройства» — перенаправление на карточку станции (T312).
  "/admin/devices": {
    foreign: ({ theirs }) => [
      "/admin/devices",
      `/admin/devices${params({ station: theirs.stationId })}`,
    ],
  },
  "/admin/feed": {
    foreign: ({ theirs }) => [
      "/admin/feed",
      `/admin/feed${params({ country: theirs.countryId })}`,
      `/admin/feed${params({ store: theirs.storeId })}`,
      `/admin/feed${params({ station: theirs.stationId })}`,
    ],
    own: ({ mine }) => ({ url: "/admin/feed", text: mine.stationName }),
  },
  "/admin/feed/[id]": {
    foreign: ({ theirs }) => [`/admin/feed/${theirs.submissionId}`],
  },
  "/admin/feed/report": {
    foreign: ({ theirs }) => [
      "/admin/feed/report",
      `/admin/feed/report${params({ station: theirs.stationId })}`,
    ],
  },
  "/admin/feed/stats": {
    foreign: ({ theirs }) => [
      "/admin/feed/stats",
      `/admin/feed/stats${params({ country: theirs.countryId })}`,
      `/admin/feed/stats${params({ store: theirs.storeId, days: "30" })}`,
    ],
    own: ({ mine }) => ({ url: "/admin/feed/stats", text: mine.countryName }),
  },
  "/admin/library": { foreign: () => ["/admin/library"] },
  // Бывший лист QR — теперь перенаправление на карточку станции (T312): чужая
  // пиццерия и станция в адресе не должны довести до чужой карточки.
  "/admin/qr": {
    foreign: ({ theirs }) => [
      "/admin/qr",
      `/admin/qr${params({ store: theirs.storeId })}`,
      `/admin/qr${params({ store: theirs.storeId, station: theirs.stationId })}`,
    ],
  },
  "/admin/qr/code": {
    foreign: ({ theirs }) => [
      `/admin/qr/code${params({ store: theirs.storeId, station: theirs.stationId })}`,
    ],
  },
  "/admin/qr/screen": {
    foreign: ({ theirs }) => [
      `/admin/qr/screen${params({ store: theirs.storeId, station: theirs.stationId })}`,
    ],
  },
  "/admin/qr/sticker": {
    foreign: ({ theirs }) => [
      `/admin/qr/sticker${params({ store: theirs.storeId, station: theirs.stationId })}`,
    ],
  },
  "/admin/stations": {
    foreign: () => ["/admin/stations"],
    own: ({ mine }) => ({ url: "/admin/stations", text: mine.stationName }),
  },
  "/admin/stations/[id]": {
    foreign: ({ theirs }) => [`/admin/stations/${theirs.stationId}`],
  },
  "/admin/stations/stickers": {
    foreign: ({ theirs, mine }) => [
      `/admin/stations/stickers${params({ stationIds: theirs.stationId })}`,
      `/admin/stations/stickers?stationIds=${mine.stationId}&stationIds=${theirs.stationId}`,
    ],
  },
  "/admin/templates": { foreign: () => ["/admin/templates"] },
  "/admin/templates/new": { foreign: () => ["/admin/templates/new"] },
};

/** Адрес маршрута так, как его пишет `admin-routes.ts`, — но с именем сегмента. */
function routeKey(file: string): string {
  const relative = file
    .replace(/^src\/app\/admin/, "/admin")
    .replace(/\/(page|route)\.tsx?$/, "");
  return relative === "" ? "/admin" : relative;
}

function markersOf(world: World): readonly string[] {
  return [
    world.theirs.countryName,
    world.theirs.storeName,
    world.theirs.stationName,
    world.theirs.stationCode,
    world.theirs.checklistTitle,
    world.theirs.checklistId,
    world.theirs.submissionId,
    world.theirs.deviceId,
    world.strangerChecklistTitle,
    world.strangerChecklistId,
  ];
}

test.describe("область видимости тенанта на весь кабинет (D145)", () => {
  test("у каждого маршрута кабинета есть проверка на чужую страну", () => {
    const missing = adminRoutes()
      .map((route) => routeKey(route.file))
      .filter((key) => PROBES[key] === undefined);
    expect(
      missing,
      `маршруты без проверки области видимости — добавьте их в PROBES: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  test("партнёр не получает чужую страну ни с одного маршрута, а своё видит", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const world = await seedWorld();
    await signInAs(page, world.login);
    const markers = markersOf(world);

    for (const route of adminRoutes()) {
      const probe = PROBES[routeKey(route.file)];
      if (probe === undefined) continue; // первый сценарий уже упал с именем маршрута

      for (const url of probe.foreign(world)) {
        // Перенаправления проходятся до конца: бывшие /admin/qr и /admin/devices
        // ведут на карточку станции, и проверяется то, куда они довели.
        const response = await page.request.get(url);
        const body = await response.text();
        const landed = response.url();
        // Вход не потерян: заворот на форму входа выглядел бы как изоляция.
        expect(landed, `${url} увёл на вход`).not.toMatch(/\/admin\/login/);
        // Идентификатор из самого адреса страница вправе повторить (он в данных
        // маршрутизатора): он не утечка, его спросили. Имена и код станции — всегда.
        for (const marker of markers.filter(
          (m) => !url.includes(m) && !landed.includes(m),
        )) {
          expect(body, `${url} отдал чужое: «${marker}»`).not.toContain(marker);
        }
      }

      if (probe.own !== undefined) {
        const { url, text } = probe.own(world);
        const body = await (await page.request.get(url)).text();
        expect(body, `${url} не показал своё: «${text}»`).toContain(text);
      }
    }
  });

  test("чужая запись по прямому адресу отвечает как несуществующая", async ({
    page,
  }) => {
    const world = await seedWorld();
    await signInAs(page, world.login);

    for (const url of [
      `/admin/checklists/${world.theirs.checklistId}`,
      `/admin/checklists/${world.strangerChecklistId}/preview`,
      `/admin/feed/${world.theirs.submissionId}`,
      `/admin/stations/${world.theirs.stationId}`,
      `/admin/qr/code${params({ store: world.theirs.storeId, station: world.theirs.stationId })}`,
      "/admin/templates/new",
      // Бывшие разделы доводят до карточки станции — чужой она быть не может.
      `/admin/devices${params({ station: world.theirs.stationId })}`,
      `/admin/qr${params({ store: world.theirs.storeId, station: world.theirs.stationId })}`,
    ]) {
      const response = await page.request.get(url);
      expect(response.status(), url).toBe(404);
    }
  });

  test("лист наклеек по списку станций печатает только свои", async ({
    page,
  }) => {
    const world = await seedWorld();
    await signInAs(page, world.login);

    const response = await page.request.get(
      `/admin/stations/stickers?stationIds=${world.mine.stationId}&stationIds=${world.theirs.stationId}`,
    );
    expect(response.status()).toBe(200);
    const body = await response.text();
    // Код на наклейке зашит в QR-картинку, а не написан текстом: своё видно по имени.
    expect(body).toContain(world.mine.stationName);
    expect(body).not.toContain(world.theirs.stationCode);
    expect(body).not.toContain(world.theirs.stationName);
  });

  test("партнёру не предлагают править шаблоны и заводить страны", async ({
    page,
  }) => {
    const world = await seedWorld();
    await signInAs(page, world.login);

    await page.goto("/admin/templates");
    await expect(page.getByTestId("templates-screen")).toBeVisible();
    await expect(page.getByTestId("new-template")).toHaveCount(0);
    await expect(page.getByTestId("template-edit")).toHaveCount(0);
  });
});
