import { describe, expect, test } from "vitest";

import { stationLinkLines } from "./station-links";

const stations = [
  { key: "kitchen", name: { ru: "Кухня", en: "Kitchen" } },
  { key: "dough", name: { ru: "Тестомес", en: "Dough room" } },
];
const codes = new Map([
  ["kitchen", "k7m2xq9pvw"],
  ["dough", "z9c4hd7vbn"],
]);

describe("печатаемый список ссылок станций", () => {
  test("имя станции берётся на языке страны, а не всегда русское", () => {
    const lines = stationLinkLines({
      stations,
      locale: "en",
      origin: "http://localhost:3100",
      basePath: "",
      codeFor: (key) => codes.get(key) ?? "",
    });

    expect(lines[0]?.name).toBe("Kitchen");
    expect(lines[1]?.name).toBe("Dough room");
  });

  test("русская страна получает русские имена", () => {
    const lines = stationLinkLines({
      stations,
      locale: "ru",
      origin: "http://localhost:3100",
      basePath: "",
      codeFor: (key) => codes.get(key) ?? "",
    });

    expect(lines[0]?.name).toBe("Кухня");
  });

  test("локали страны нет в имени — берётся английское, потом русское", () => {
    const lines = stationLinkLines({
      stations: [{ key: "kitchen", name: { ru: "Кухня" } }],
      locale: "sr",
      origin: "http://localhost:3100",
      basePath: "",
      codeFor: () => "k7m2xq9pvw",
    });

    expect(lines[0]?.name).toBe("Кухня");
  });

  // Случай, который раньше не проверялся ничем: до сведения списка языков (T268) запас
  // был написан буквами в одну строку, и покрытие считало эту строку пройденной, хотя
  // до самого запаса не доходил ни один тест. На кухню такая наклейка попадает с именем,
  // которого в продукте нет ни на одном языке, и печатать в этом месте `undefined`
  // нельзя: человек прочитает это как название станции. Ссылка при этом обязана
  // работать — наклейку сканируют, а не читают.
  test("имени нет ни на одном языке продукта — имя пустое, а ссылка рабочая", () => {
    const lines = stationLinkLines({
      stations: [{ key: "kitchen", name: { sr: "Кухиња" } }],
      locale: "en",
      origin: "http://localhost:3100",
      basePath: "",
      codeFor: () => "k7m2xq9pvw",
    });

    expect(lines[0]?.name).toBe("");
    expect(lines[0]?.url).toBe("http://localhost:3100/s/k7m2xq9pvw");
  });

  test("базовый путь площадки попадает в напечатанную ссылку", () => {
    const lines = stationLinkLines({
      stations,
      locale: "en",
      origin: "https://muspelheim.example.net:10000",
      basePath: "/qr",
      codeFor: (key) => codes.get(key) ?? "",
    });

    expect(lines[0]?.url).toBe(
      "https://muspelheim.example.net:10000/qr/s/k7m2xq9pvw",
    );
  });

  test("без базового пути ссылка остаётся прежней", () => {
    const lines = stationLinkLines({
      stations,
      locale: "en",
      origin: "http://localhost:3100",
      basePath: "",
      codeFor: (key) => codes.get(key) ?? "",
    });

    expect(lines[0]?.url).toBe("http://localhost:3100/s/k7m2xq9pvw");
  });
});
