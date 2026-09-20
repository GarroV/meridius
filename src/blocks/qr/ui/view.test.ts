import { describe, expect, it } from "vitest";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

import {
  CONFIRM_REISSUE,
  QR_CODE_PATH,
  QR_PATH,
  QR_SCREEN_PATH,
  parseQrView,
  parseStationRef,
  qrCodeHref,
  qrHref,
  qrScreenHref,
  qrStickerHref,
} from "./view";

const STORE = "11111111-2222-4333-8444-555555555555";
const STATION = "66666666-7777-4888-8999-aaaaaaaaaaaa";

describe("состояние экрана QR в адресе", () => {
  it("берёт пиццерию и станцию из адреса", () => {
    expect(parseQrView({ store: STORE, station: STATION })).toEqual({
      storeId: STORE,
      stationId: STATION,
    });
  });

  it("отбрасывает то, что не идентификатор: адрес правит кто угодно", () => {
    expect(
      parseQrView({ store: "'; drop table stations", station: "42" }),
    ).toEqual({});
  });

  it("из повторённого параметра берёт первое значение, а не склейку", () => {
    expect(parseQrView({ store: [STORE, STATION] }).storeId).toBe(STORE);
  });

  it("узнаёт свой код отказа и не пропускает ни выдуманный, ни чужой", () => {
    expect(parseQrView({ error: "notFound" }).error).toBe("notFound");
    expect(parseQrView({ error: "codeCollision" }).error).toBe("codeCollision");
    expect(parseQrView({ error: "какой-то" }).error).toBeUndefined();
    // Отказ справочника, которого перевыпуск не выдаёт: показывать его нечем.
    expect(parseQrView({ error: "unknownTimezone" }).error).toBeUndefined();
  });

  it("собирает адрес экрана: пустые значения в него не попадают", () => {
    expect(qrHref({})).toBe(QR_PATH);
    expect(qrHref({ storeId: STORE })).toBe(`${QR_PATH}?store=${STORE}`);
    expect(
      qrHref({ storeId: STORE, stationId: STATION, error: "notFound" }),
    ).toBe(`${QR_PATH}?store=${STORE}&station=${STATION}&error=notFound`);
  });

  it("адрес планшета и адрес опроса несут обе ссылки на станцию", () => {
    const ref = { storeId: STORE, stationId: STATION };

    expect(qrScreenHref(ref)).toBe(
      `${QR_SCREEN_PATH}?store=${STORE}&station=${STATION}`,
    );
    expect(qrCodeHref(ref)).toBe(
      `${QR_CODE_PATH}?store=${STORE}&station=${STATION}`,
    );
  });

  it("ссылку на станцию признаёт только целой: без пиццерии станцию не найти", () => {
    expect(parseStationRef({ store: STORE, station: STATION })).toEqual({
      storeId: STORE,
      stationId: STATION,
    });
    expect(parseStationRef({ store: STORE })).toBeNull();
    expect(parseStationRef({ station: STATION })).toBeNull();
    expect(parseStationRef({ store: "мусор", station: STATION })).toBeNull();
  });
});

describe("адрес раздела — один факт, а не собственная копия (T116)", () => {
  it("QR_PATH читает адрес у core/admin-sections, а не хранит свою строку", () => {
    // Сравнение идёт с чужим модулем, а не с локальной переменной этого же файла:
    // до T116 здесь стояла своя строка `"/admin/qr"`, и `qrHref` сверялась бы сама
    // с собой — тест остался бы зелёным, даже разойдись раздел с боковым меню.
    expect(QR_PATH).toBe(ADMIN_SECTIONS.qr.path);
  });

  it("подпути листа собраны из QR_PATH, а не заведены отдельными строками", () => {
    expect(QR_SCREEN_PATH).toBe(`${QR_PATH}/screen`);
    expect(QR_CODE_PATH).toBe(`${QR_PATH}/code`);
    expect(qrStickerHref({ storeId: STORE, stationId: STATION })).toBe(
      `${QR_PATH}/sticker?store=${STORE}&station=${STATION}`,
    );
  });
});

describe("вопрос о перевыпуске кода в адресе (T266)", () => {
  it("confirm=reissue вместе со станцией разбирается в вопрос", () => {
    expect(
      parseQrView({ store: STORE, station: STATION, confirm: "reissue" }),
    ).toEqual({
      storeId: STORE,
      stationId: STATION,
      confirm: "reissue",
    });
  });

  it("confirm=reissue без станции отбрасывается вместе с вопросом", () => {
    expect(
      parseQrView({ store: STORE, confirm: "reissue" }),
      "Окно без названия станции спрашивало бы ни о чём — такой вопрос не задаётся.",
    ).toEqual({ storeId: STORE });
  });

  it("confirm=reissue со станцией не-uuid отбрасывается вместе со станцией", () => {
    expect(
      parseQrView({ store: STORE, station: "42", confirm: "reissue" }),
      "Станция не разобралась — вопрос про неё не должен был бы держаться в адресе.",
    ).toEqual({ storeId: STORE });
  });

  it("чужое значение confirm игнорируется", () => {
    expect(
      parseQrView({ store: STORE, station: STATION, confirm: "delete" })
        .confirm,
    ).toBeUndefined();
    expect(
      parseQrView({ store: STORE, station: STATION, confirm: "1" }).confirm,
    ).toBeUndefined();
  });

  it("qrHref несёт confirm последним параметром, а без него — не несёт вовсе", () => {
    expect(
      qrHref({
        storeId: STORE,
        stationId: STATION,
        confirm: CONFIRM_REISSUE,
      }),
    ).toBe(`${QR_PATH}?store=${STORE}&station=${STATION}&confirm=reissue`);

    expect(
      qrHref({ storeId: STORE, stationId: STATION }),
      "«Отмена» ведёт по этому же адресу без вопроса — попади сюда confirm по " +
        "умолчанию, кнопка отмены заводила бы обратно в то же окно.",
    ).toBe(`${QR_PATH}?store=${STORE}&station=${STATION}`);
  });
});
