// Что продукт считает дыркой станции.
//
// Проверка стоит тут, а не сводится к прогону экрана, по цене ошибки: обе дырки — это
// утверждение о живом продукте, которое человек читает как факт и по которому принимает
// решение ехать в пиццерию. Ошибка в любую сторону дорогая и тихая. Лишняя метка учит
// не смотреть на метки; пропущенная означает станцию, чья наклейка полгода открывает
// пустоту, и узнают об этом не здесь.
import { describe, expect, test } from "vitest";

import { SILENT_AFTER_HOURS, gapsOf } from "./gaps";

const NOW = new Date("2026-09-25T12:00:00.000Z");

function hoursBefore(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

/** Станция заведена давно: возраст в этих случаях ни на что не влияет. */
const LONG_AGO = hoursBefore(24 * 30);

describe("дырки станции", () => {
  test("чек-листа нет — это дырка, и заполнения тут ни при чём", () => {
    // Arrange: чек-листа нет, но когда-то заполняли — чек-лист сняли позже.
    const facts = {
      checklistCount: 0,
      lastSubmissionAt: hoursBefore(1),
      createdAt: LONG_AGO,
    };

    // Act
    const gaps = gapsOf(facts, NOW);

    // Assert
    expect(gaps).toEqual(["noChecklist"]);
  });

  test("станция без чек-листа не числится ещё и молчащей", () => {
    // Молчать нечему: складывать эти две дырки — значит показать одну станцию
    // дважды в двух разных счётчиках.
    const gaps = gapsOf(
      { checklistCount: 0, lastSubmissionAt: null, createdAt: LONG_AGO },
      NOW,
    );

    // Именно «не содержит silent», а не «длина 1»: длину проходит и сломанный счёт,
    // вернувший одну не ту дырку. Проверено отрицательным прогоном — на подмене
    // условия про чек-лист этот тест остался зелёным.
    expect(gaps).not.toContain("silent");
  });

  test("заполняли в пределах суток — дырок нет", () => {
    const gaps = gapsOf(
      {
        checklistCount: 1,
        lastSubmissionAt: hoursBefore(SILENT_AFTER_HOURS - 1),
        createdAt: LONG_AGO,
      },
      NOW,
    );

    expect(gaps).toEqual([]);
  });

  test("не заполняли дольше суток — станция молчит", () => {
    const gaps = gapsOf(
      {
        checklistCount: 1,
        lastSubmissionAt: hoursBefore(SILENT_AFTER_HOURS + 1),
        createdAt: LONG_AGO,
      },
      NOW,
    );

    expect(gaps).toEqual(["silent"]);
  });

  test("ровно на границе станция ещё не молчит", () => {
    // Граница включительно в сторону «всё хорошо»: ровно сутки — это смена, которая
    // только что закончилась, и метка на ней была бы придиркой.
    const gaps = gapsOf(
      {
        checklistCount: 1,
        lastSubmissionAt: hoursBefore(SILENT_AFTER_HOURS),
        createdAt: LONG_AGO,
      },
      NOW,
    );

    expect(gaps).toEqual([]);
  });

  test("только что заведённая станция не молчит, хотя её ни разу не заполняли", () => {
    // Иначе каждая новая станция рождается с красной меткой, и человек учится
    // не смотреть на метки вообще — а они тут единственное, ради чего экран есть.
    const gaps = gapsOf(
      { checklistCount: 1, lastSubmissionAt: null, createdAt: hoursBefore(2) },
      NOW,
    );

    expect(gaps).toEqual([]);
  });

  test("давно заведённая станция, которую не заполняли ни разу, молчит", () => {
    const gaps = gapsOf(
      { checklistCount: 1, lastSubmissionAt: null, createdAt: LONG_AGO },
      NOW,
    );

    expect(gaps).toEqual(["silent"]);
  });
});
