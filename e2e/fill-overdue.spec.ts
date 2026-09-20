import { expect, test } from "@playwright/test";

import { stationScanUrl } from "../src/blocks/qr/scan-url";
import { seedFillStand } from "./fill-fixtures";
import { E2E_PUBLIC_BASE_URL } from "./public-base-url";

/**
 * Сигнал станции о просроченной проверке (T138, issue #51) в настоящем браузере.
 *
 * Модульные проверки `overdue.test.ts` считают сам сигнал; здесь проверяется то, чего
 * они не видят: что плашка дошла до экрана, что отметка её гасит, и что ограничение
 * «звук работает, пока экран открыт» названо НА ЭКРАНЕ, а не в документации.
 *
 * Звук в безголовом браузере не проверяется и проверяться не может: гудок зависит от
 * разрешения, которого странице без касания не дают. Именно поэтому плашка, а не звук,
 * и есть то, чем продукт сообщает о просрочке, — звук лишь помогает её заметить.
 *
 * Окно чек-листа считается ОТ МОМЕНТА ПРОГОНА, а не задаётся числом. Иначе сценарий
 * зависел бы от часа, в который его запустили: просрочка — это закрывшийся проход, и
 * в пиццерии, открывшейся минуту назад, её взяться неоткуда. Прогон в 00:05 краснел бы,
 * а в 14:05 зеленел, и выглядело бы это как плавающий дефект продукта.
 */

const PHONE = { width: 375, height: 760 } as const;

/** Часовой пояс станций стенда — UTC, поэтому местное время равно времени прогона. */
const MINUTES_IN_DAY = 24 * 60;
/** Сколько времени окно уже идёт к моменту прогона: три закрытых прохода и один идущий. */
const WINDOW_BEHIND_MINUTES = 95;
const WINDOW_AHEAD_MINUTES = 95;
const EVERY_MINUTES = 30;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clock(totalMinutes: number): string {
  const inDay =
    ((totalMinutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  return `${pad(Math.floor(inDay / 60))}:${pad(inDay % 60)}:00`;
}

function stickerPath(code: string): string {
  return new URL(stationScanUrl(E2E_PUBLIC_BASE_URL, code)).pathname;
}

interface OverdueItemSpec {
  readonly id: string;
  readonly title: string;
  readonly remindEveryMinutes?: number;
}

/**
 * Пиццерия, работающая полтора часа: окно открылось 95 минут назад и закроется через 95.
 * Обход каждые полчаса, ни одной отметки — значит три прохода закрылись без неё, а
 * четвёртый идёт прямо сейчас. Ровно то положение, ради которого сигнал и заведён.
 */
function standShape(now: Date, items: readonly OverdueItemSpec[]) {
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const start = nowMinutes - WINDOW_BEHIND_MINUTES;
  const end = nowMinutes + WINDOW_AHEAD_MINUTES;

  return {
    // Пиццерия русская НАРОЧНО: язык экрана задаёт она, а не телефон (D122), а эти
    // сценарии читают русские надписи.
    countryLocale: "ru" as const,
    windowStart: clock(start),
    windowEnd: clock(end),
    sections: [
      {
        id: "s-overdue",
        title: { ru: "Обходы", en: "Rounds" },
        source: "own",
        items: items.map((item) => ({
          id: item.id,
          title: { ru: item.title, en: item.title },
          type: "bool",
          severity: "normal",
          schedule: [
            {
              from: clock(start).slice(0, 5),
              to: clock(end).slice(0, 5),
              everyMinutes: EVERY_MINUTES,
            },
          ],
          ...(item.remindEveryMinutes === undefined
            ? {}
            : { remindEveryMinutes: item.remindEveryMinutes }),
        })),
      },
    ],
  };
}

test.describe("сигнал о просроченной проверке", () => {
  // Русская речь экрана: плашку и подсказку сценарии читают по-русски.
  // Телефон русский И пиццерия русская: язык экрана задаёт пиццерия (D122), а эти
  // сценарии читают русские надписи. Умолчание стенда — английская страна, как и
  // весь остальной продукт (D083), поэтому русский тут назван явно у каждой станции.
  test.use({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
    locale: "ru-RU",
  });

  test("закрывшийся без отметки проход поднимает сигнал станции", async ({
    page,
  }) => {
    const shape = standShape(new Date(), [
      { id: "i-line", title: "Линия начинения", remindEveryMinutes: 20 },
    ]);
    const stand = await seedFillStand("просрочка-один", shape);

    await page.goto(stickerPath(stand.code));

    const plate = page.getByTestId("rounds-overdue");
    await expect(plate).toBeVisible();
    // Плашка называет пропущенное поимённо: «что-то просрочено» не говорит, куда идти.
    await expect(plate).toContainText("Линия начинения");
    // Три закрытых прохода без отметки — столько и сказано.
    await expect(plate).toContainText("3");
  });

  test("три просрочки дают ОДИН сигнал станции, а не три", async ({ page }) => {
    // Звонит станция, а не пункт: у планшета один динамик, и три гудка подряд
    // научили бы смену выключать звук, а не ходить.
    const shape = standShape(new Date(), [
      { id: "i-line", title: "Линия начинения", remindEveryMinutes: 60 },
      { id: "i-fridge", title: "Холодильник", remindEveryMinutes: 10 },
      { id: "i-floor", title: "Пол в зале", remindEveryMinutes: 20 },
    ]);
    const stand = await seedFillStand("просрочка-три", shape);

    await page.goto(stickerPath(stand.code));

    await expect(page.getByTestId("rounds-overdue")).toHaveCount(1);
    const plate = page.getByTestId("rounds-overdue");
    await expect(plate).toContainText("Линия начинения");
    await expect(plate).toContainText("Холодильник");
    await expect(plate).toContainText("Пол в зале");
    // Девять пропущенных проходов на троих — и одна плашка на всех.
    await expect(plate).toContainText("9");
  });

  test("отметка гасит сигнал", async ({ page }) => {
    const shape = standShape(new Date(), [
      { id: "i-line", title: "Линия начинения", remindEveryMinutes: 20 },
    ]);
    const stand = await seedFillStand("просрочка-гаснет", shape);

    await page.goto(stickerPath(stand.code));
    await expect(page.getByTestId("rounds-overdue")).toBeVisible();

    // Отметка встаёт в ТЕКУЩИЙ проход (D066) и пропущенные не догоняет: гасит сигнал
    // не исчезновение пропусков, а сам факт, что смена пошла и отметила.
    await page
      .getByTestId("round-i-line")
      // Именно кнопка и точным совпадением: «Непорядок» содержит «порядок»
      // подстрокой, и нестрогий поиск нашёл бы обе — то есть отметил бы провал.
      .getByRole("button", { name: "Порядок", exact: true })
      .tap();

    await expect(page.getByTestId("rounds-overdue")).toHaveCount(0);
    // Пропуски при этом никуда не делись — они остаются в строке обхода.
    await expect(page.getByTestId("round-i-line")).toContainText("Пропущено 3");
  });

  test("ограничение «звук работает, пока экран открыт» названо на самом экране", async ({
    page,
  }) => {
    const shape = standShape(new Date(), [
      { id: "i-line", title: "Линия начинения", remindEveryMinutes: 20 },
    ]);
    const stand = await seedFillStand("просрочка-подсказка", shape);

    await page.goto(stickerPath(stand.code));

    // Подсказка стоит постоянно, а не только в момент звонка: узнать об ограничении
    // тогда, когда сигнал уже пропущен, поздно — планшет на кухне гасят.
    const hint = page.getByTestId("rounds-remind-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("пока этот экран открыт");
  });

  test("без настройки оповещения станция молчит и звука не обещает", async ({
    page,
  }) => {
    // Нет поля — не оповещать (D068). Плашки нет, и подсказки про звук тоже:
    // обещание звука там, где его не будет, хуже молчания.
    const shape = standShape(new Date(), [
      { id: "i-line", title: "Линия начинения" },
    ]);
    const stand = await seedFillStand("просрочка-молчит", shape);

    await page.goto(stickerPath(stand.code));

    // Панель обходов на месте и пропуски показывает — молчит именно сигнал.
    await expect(page.getByTestId("round-i-line")).toContainText("Пропущено 3");
    await expect(page.getByTestId("rounds-overdue")).toHaveCount(0);
    await expect(page.getByTestId("rounds-remind-hint")).toHaveCount(0);
  });
});
