// Карточка заполнения на телефоне (375 px): экран обязан помещаться в окно.
//
// Решение D092: кабинет на телефоне не полноценный, но пригодный для правки —
// «читаемые заголовки, списки и кнопки на 375 px», а таблицы и сетки остаются
// СО СВОЕЙ прокруткой. Отсюда обе проверки ниже: страница не уезжает вбок, а
// сетка ответов прокручивается внутри себя и ничего при этом не обрезает.
//
// Почему отдельный файл, а не `feed.spec.ts`. Там заготовка на четыре станции и три
// чек-листа — она проверяет ленту и фильтры. Здесь нужна ОДНА карточка, но с самым
// широким её содержимым: длинный текстовый ответ, критичная метка, метка «в этом
// режиме не запрашивали» и самый длинный итог. Ширина меряется числом, и заготовка
// обязана держать именно тот случай, на котором экран ломался.
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Pool } from "pg";

import { E2E_ADMIN_PASSWORD } from "./admin-credentials";
import { e2eDatabaseUrl } from "./database";

// Телефон: боковое меню кабинета съедает 208 из 375 px, и всё, что не умеет сужаться
// или прокручиваться внутри себя, тащит вбок всю страницу — вместе с меню и шапкой.
const PHONE = { width: 375, height: 800 } as const;

/**
 * Секции карточки: самое широкое, что в ней бывает.
 *  • критичный числовой пункт с подсказкой и границами — метка «критичный» плюс пояснение;
 *  • важный текстовый пункт — длинный ответ в колонке значения;
 *  • обычный пункт, который в сокращённой смене не спрашивали, — метка «в этом режиме
 *    не запрашивали», самая длинная метка продукта.
 */
const SECTIONS = [
  {
    id: "sp-fridge",
    title: { ru: "Холодильники и заготовки", en: "Fridges" },
    source: { blockId: "sp-block-fridge" },
    items: [
      {
        id: "sp-temp",
        title: {
          ru: "Температура холодильной камеры",
          en: "Fridge temperature",
        },
        type: "number",
        severity: "critical",
        min: 2,
        max: 4,
        hint: { ru: "+2…+4 °C", en: "+2…+4 °C" },
      },
      {
        id: "sp-note",
        title: { ru: "Что передать следующей смене", en: "Handover note" },
        type: "text",
        severity: "major",
      },
      {
        id: "sp-floor",
        title: { ru: "Протереть полы в зале", en: "Wipe the floor" },
        type: "bool",
        severity: "normal",
      },
    ],
  },
];

const LONG_ANSWER =
  "Порвано уплотнение двери холодильника, вызвал техника на завтра, " +
  "до ремонта заготовки переставлены в резервную камеру";

interface Seeded {
  readonly submissionId: string;
}

/**
 * Данные кладутся прямо в базу, а не заводятся через экраны: сценарий меряет ширину
 * карточки, и падение в чужом блоке искали бы не там. Названия уникальны на прогон —
 * файлы сценариев идут параллельно.
 */
async function seed(): Promise<Seeded> {
  const label = randomUUID().slice(0, 8);
  const pool = new Pool({ connectionString: e2eDatabaseUrl() });

  try {
    const country = await pool.query<{ id: string }>(
      "insert into countries (name, locale) values ($1, 'ru') returning id",
      [`Страна ${label}`],
    );
    const store = await pool.query<{ id: string }>(
      "insert into stores (country_id, name, timezone) values ($1, $2, 'UTC') returning id",
      [country.rows[0]?.id, `Пиццерия ${label} на проспекте Абая`],
    );
    const station = await pool.query<{ id: string }>(
      "insert into stations (store_id, name, code) values ($1, $2, $3) returning id",
      [store.rows[0]?.id, `Кухня ${label}`, `sp${label}`.slice(0, 10)],
    );
    const stationId = station.rows[0]?.id;

    const checklist = await pool.query<{ id: string }>(
      `insert into checklists (station_id, title, window_start, window_end)
       values ($1, $2, '00:00', '23:59') returning id`,
      [
        stationId,
        JSON.stringify({
          ru: `Открытие кухни ${label}`,
          en: `Kitchen opening ${label}`,
        }),
      ],
    );
    const version = await pool.query<{ id: string }>(
      `insert into checklist_versions
         (checklist_id, version_number, status, station_id, sections, published_at)
       values ($1, 1, 'published', $2, $3, now()) returning id`,
      [checklist.rows[0]?.id, stationId, JSON.stringify(SECTIONS)],
    );

    // Сокращённая смена: обычный пункт в ней не спрашивают, и в карточке он получает
    // метку «в этом режиме не запрашивали» (D055).
    const at = Date.now();
    const submission = await pool.query<{ id: string }>(
      `insert into submissions (version_id, station_id, mode, snapshot, answers, started_at)
       values ($1, $2, 'reduced', $3, $4, now() - interval '204 seconds') returning id`,
      [
        version.rows[0]?.id,
        stationId,
        JSON.stringify(SECTIONS),
        JSON.stringify([
          {
            itemId: "sp-temp",
            value: 9,
            at,
            comment: "Порвано уплотнение двери, вызвал техника",
          },
          { itemId: "sp-note", value: LONG_ANSWER, at },
        ]),
      ],
    );

    const id = submission.rows[0]?.id;
    if (id === undefined)
      throw new Error("Заполнение для сценария не завелось");
    return { submissionId: id };
  } finally {
    await pool.end();
  }
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Пароль").fill(E2E_ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-home")).toBeVisible();
}

interface Size {
  readonly scrollWidth: number;
  readonly clientWidth: number;
}

/** Ширина документа против ширины окна: разница и есть «страница уехала вбок». */
async function pageSize(page: Page): Promise<Size> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

/** Метка верхней полосы: где стоит и не обрезано ли её содержимое. */
interface Label {
  readonly name: string;
  readonly left: number;
  readonly right: number;
  readonly clipped: number;
}

async function topbarLabels(page: Page): Promise<readonly Label[]> {
  return page.evaluate(() => {
    const nodes: readonly (readonly [string, Element | null])[] = [
      ["итог", document.querySelector('[data-testid="outcome-tag"]')],
      [
        "ссылка на чек-лист",
        document.querySelector(
          '[data-testid="submission-screen"] header a[href*="/admin/checklists/"]',
        ),
      ],
    ];
    return nodes.flatMap(([name, node]) => {
      if (node === null) return [];
      const box = node.getBoundingClientRect();
      return [
        {
          name,
          left: Math.round(box.left),
          right: Math.round(box.right),
          clipped: Math.max(0, node.scrollWidth - node.clientWidth),
        },
      ];
    });
  });
}

test.describe("карточка заполнения на телефоне", () => {
  // Язык кабинета берётся из заголовка браузера (src/i18n/request.ts): без этой строки
  // экран говорит по-английски, и меряли бы мы ширину других слов.
  test.use({ locale: "ru-RU" });

  test("сетка ответов прокручивается внутри себя, а не тащит страницу вбок", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    await page.setViewportSize(PHONE);
    await page.goto(`/admin/feed/${seeded.submissionId}`);
    await expect(page.getByTestId("answers-card")).toBeVisible();

    const size = await pageSize(page);
    expect(
      size.scrollWidth,
      "Карточка заполнения шире окна телефона: сетка ответов не умеет ни сужаться, " +
        "ни прокручиваться внутри себя и утащила вбок весь кабинет — вместе с меню, " +
        "шапкой и полосой фактов (D092).",
    ).toBe(size.clientWidth);

    // Сетка действительно шире телефона — иначе проверка выше ничего не значит:
    // её прошла бы и карточка, из которой ответы просто исчезли.
    const scroller = page.getByTestId("answers-scroller");
    const inner = await scroller.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    expect(
      inner.scrollWidth,
      "Прокрутка сетки ответов пустая: значит, ширину сняли не прокруткой, а тем, " +
        "что содержимое куда-то делось.",
    ).toBeGreaterThan(inner.clientWidth);

    // Строки на месте и целы: ответ, время и метки видны, а не обрезаны по буквам.
    await expect(page.getByTestId("answer-row")).toHaveCount(3);
    await expect(page.getByTestId("answer-comment")).toBeVisible();
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="answer-row"] > *')]
        .filter((cell) => cell.scrollWidth - cell.clientWidth > 1)
        .map((cell) => cell.textContent.slice(0, 40)),
    );
    expect(
      clipped,
      "Внутри прокрутки содержимое строки всё равно обрезано: сетке не хватает " +
        "ширины даже там, где её никто не ограничивает.",
    ).toEqual([]);
  });

  test("метки шапки не обрезаются и не уходят за край окна", async ({
    page,
  }) => {
    const seeded = await seed();
    await signIn(page);

    await page.setViewportSize(PHONE);
    await page.goto(`/admin/feed/${seeded.submissionId}`);
    await expect(page.getByTestId("outcome-tag")).toBeVisible();

    const labels = await topbarLabels(page);
    expect(labels).toHaveLength(2);

    for (const label of labels) {
      expect(
        label.right,
        `Метка «${label.name}» уехала за правый край окна (${String(label.right)} px ` +
          `при ширине окна ${String(PHONE.width)} px): на телефоне её не видно.`,
      ).toBeLessThanOrEqual(PHONE.width);
      expect(
        label.left,
        `Метка «${label.name}» уехала за левый край окна.`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        label.clipped,
        `Текст метки «${label.name}» обрезан на ${String(label.clipped)} px: ` +
          "метка не умеет переноситься и не помещается в отведённую ей ширину.",
      ).toBe(0);
    }
  });

  // Вторая половина T203, которую блок `feed` починить не мог: заголовок налезал на
  // метки, потому что боковое меню съедало 208 px из 375 и заголовку оставалось 6 px
  // при собственном минимуме 104. Схлопывающееся меню (T193, блок `core`) убрало
  // причину — замер после слияния обоих блоков: заголовку 343 px, пересечения нет.
  // Проверка стоит здесь, чтобы наложение не вернулось незаметно: оно выглядит как
  // «текст немного налезает», а не как поломка, и глазами ловится плохо.
  test("заголовок карточки не налезает на метки шапки", async ({ page }) => {
    const seeded = await seed();
    await signIn(page);

    await page.setViewportSize(PHONE);
    await page.goto(`/admin/feed/${seeded.submissionId}`);
    await expect(page.getByTestId("outcome-tag")).toBeVisible();

    const measured = await page.evaluate(() => {
      const heading = document.querySelector("h1");
      const tag = document.querySelector('[data-testid="outcome-tag"]');
      if (!heading || !tag) return null;
      const h = heading.getBoundingClientRect();
      const t = tag.getBoundingClientRect();
      const overlapX = Math.min(h.right, t.right) - Math.max(h.left, t.left);
      const overlapY = Math.min(h.bottom, t.bottom) - Math.max(h.top, t.top);
      return {
        overlap: overlapX > 0 && overlapY > 0 ? Math.round(overlapX) : 0,
        headingWidth: Math.round(h.width),
        headingText: heading.scrollWidth,
      };
    });

    expect(measured, "заголовка или метки нет на экране вовсе").not.toBeNull();
    expect(
      measured?.overlap,
      "Заголовок карточки и метка шапки накладываются друг на друга: " +
        "заголовку не хватает ширины, и его текст проходит под меткой.",
    ).toBe(0);
    expect(
      measured?.headingText,
      `Текст заголовка (${String(measured?.headingText)} px) не помещается в отведённую ` +
        `ему ширину (${String(measured?.headingWidth)} px) и выливается из своей коробки.`,
    ).toBeLessThanOrEqual(measured?.headingWidth ?? 0);
  });
});
