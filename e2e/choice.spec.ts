import { expect, test } from "@playwright/test";

import { stationScanUrl } from "../src/blocks/qr/scan-url";
import { addChecklistToStation, seedFillStand } from "./fill-fixtures";
import { E2E_PUBLIC_BASE_URL } from "./public-base-url";

/**
 * На станции открыто больше одного чек-листа (#60): обход менеджера идёт весь день
 * поверх приёма смены, и оба относятся к одной наклейке.
 *
 * Сценарий в настоящем браузере, потому что проверяется именно то, чего модульные
 * тесты не видят: что выбор доехал до экрана, что он сделан ссылками и работает без
 * клиентского кода, и что выбранный чек-лист открывается целиком.
 */

const PHONE = { width: 375, height: 760 } as const;
const TAP_MIN = 44;

const SECOND_TITLE = { ru: "Обход менеджера", en: "Manager round" } as const;

function stickerPath(code: string): string {
  return new URL(stationScanUrl(E2E_PUBLIC_BASE_URL, code)).pathname;
}

test.describe("на станции открыто несколько чек-листов", () => {
  // Язык задан явно: браузер сценария по умолчанию просит английский, и тогда
  // проверялись бы не те строки, что видит смена.
  // Телефон русский И пиццерия русская: язык экрана задаёт пиццерия (D122), а эти
  // сценарии читают русские надписи. Умолчание стенда — английская страна, как и
  // весь остальной продукт (D083), поэтому русский тут назван явно у каждой станции.
  test.use({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
    locale: "ru-RU",
  });

  test("наклейка предлагает выбор, и выбранный чек-лист открывается", async ({
    page,
  }) => {
    const stand = await seedFillStand("выбор", { countryLocale: "ru" });
    await addChecklistToStation(stand.stationId, { title: SECOND_TITLE });

    await page.goto(stickerPath(stand.code));

    const screen = page.getByTestId("fill-choice");
    await expect(screen).toBeVisible();
    // Пиццерия и станция названы, окна в шапке нет: у каждого чек-листа оно своё.
    await expect(screen).toContainText(stand.storeName);
    await expect(screen).toContainText(stand.stationName);

    const options = page.getByTestId("fill-choice-option");
    await expect(options).toHaveCount(2);
    // Оба названы. Порядок здесь не проверяется: у обоих чек-листов стенда одно и то
    // же окно, а по равным окнам порядок задаёт идентификатор — постоянный, но
    // человеку не предсказуемый. Проверять его значило бы закрепить случайность.
    await expect(options.filter({ hasText: "Открытие кухни" })).toHaveCount(1);
    const round = options.filter({ hasText: SECOND_TITLE.ru });
    await expect(round).toHaveCount(1);

    // Палец попадает: строка выбора не меньше цели касания.
    const box = await round.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(TAP_MIN);

    await round.tap();

    await expect(page.getByTestId("fill-screen")).toBeVisible();
    await expect(page.getByTestId("fill-title")).toHaveText(SECOND_TITLE.ru);
    // Выбор остался в адресе: сотрудник может перезагрузить страницу и не выбирать снова.
    expect(new URL(page.url()).searchParams.get("c")).not.toBeNull();
  });

  test("чужой чек-лист в адресе не подставляет свой: снова выбор", async ({
    page,
  }) => {
    const mine = await seedFillStand("выбор-свой", { countryLocale: "ru" });
    await addChecklistToStation(mine.stationId, { title: SECOND_TITLE });
    const alien = await seedFillStand("выбор-чужой", { countryLocale: "ru" });
    const alienChecklist = await addChecklistToStation(alien.stationId, {
      title: { ru: "Чужой обход", en: "Alien round" },
    });

    await page.goto(
      `${stickerPath(mine.code)}?c=${alienChecklist.checklistId}`,
    );

    await expect(page.getByTestId("fill-choice")).toBeVisible();
    await expect(page.getByTestId("fill-choice-option")).toHaveCount(2);
    await expect(page.getByTestId("fill-choice")).not.toContainText(
      "Чужой обход",
    );
  });

  test("один открытый чек-лист выбора не показывает: он открывается сразу", async ({
    page,
  }) => {
    const stand = await seedFillStand("выбор-один", { countryLocale: "ru" });

    await page.goto(stickerPath(stand.code));

    await expect(page.getByTestId("fill-screen")).toBeVisible();
    await expect(page.getByTestId("fill-choice")).toHaveCount(0);
  });
});
