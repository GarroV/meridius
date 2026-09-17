import { beforeEach, describe, expect, it } from "vitest";

import {
  FILL_TICKET_MAX_AGE_MS,
  forgetIssuedTickets,
  issueFillTicket,
  readFillTicket,
} from "./ticket";

const CODE = "abcdefghjk";
const VERSION = "3f1c2c0e-9d3a-4b0e-8a2f-6f1d2c3b4a59";
const SUBJECT = { code: CODE, versionId: VERSION };
const NOW = new Date("2026-09-17T10:00:00Z");

/** Подпись из пропуска — то, что нападающему приходится подобрать. */
function signatureOf(ticket: string): string {
  return ticket.slice(ticket.indexOf(".") + 1);
}

describe("пропуск на отправку заполнения", () => {
  beforeEach(() => {
    forgetIssuedTickets();
  });

  it("возвращает то самое время выдачи, которое поставил сервер", () => {
    const issued = new Date(NOW.getTime() - 7 * 60 * 1000);

    const pass = readFillTicket(issueFillTicket(SUBJECT, issued), SUBJECT, NOW);

    expect(pass).toStrictEqual({ ok: true, value: issued.getTime() });
  });

  it("подделанное время выдачи не проходит", () => {
    // Ровно разбор из advisory: длительность рисуется сдвигом начала на три часа
    // назад. Со старым телом это было одно число в JSON; теперь подпись перестаёт
    // сходиться, и тело до записи не доходит.
    const ticket = issueFillTicket(SUBJECT, NOW);
    const forged = `${String(NOW.getTime() - 3 * 60 * 60 * 1000)}.${signatureOf(ticket)}`;

    expect(readFillTicket(forged, SUBJECT, NOW)).toStrictEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("пропуск одной станции не годится для другой", () => {
    // Иначе один живой код с наклейки открывал бы запись по всей сети: код станции
    // стоит в теле, и без привязки его хватило бы подменить.
    const ticket = issueFillTicket(SUBJECT, NOW);

    const pass = readFillTicket(
      ticket,
      { code: "zzzzzzzzzz", versionId: VERSION },
      NOW,
    );

    expect(pass).toStrictEqual({ ok: false, reason: "malformed" });
  });

  it("пропуск одной версии не годится для другой", () => {
    const ticket = issueFillTicket(SUBJECT, NOW);

    const pass = readFillTicket(
      ticket,
      { code: CODE, versionId: "00000000-0000-4000-8000-000000000000" },
      NOW,
    );

    expect(pass).toStrictEqual({ ok: false, reason: "malformed" });
  });

  it("мусор вместо пропуска отказывается как мусор", () => {
    for (const raw of [
      "",
      ".",
      "подпись",
      ".подпись",
      "не-число.подпись",
      "-1.подпись",
      `${String(NOW.getTime())}.`,
      `${String(NOW.getTime())}.${"a".repeat(43)}`,
    ]) {
      expect(readFillTicket(raw, SUBJECT, NOW).ok).toBe(false);
    }
  });

  it("враждебная подпись отказывает, а не роняет приём", () => {
    // Класс дефекта, а не случай. Подпись — это всё, что стоит в пропуске после
    // точки, и приходит она от клиента целиком: сравнивать её длину в СИМВОЛАХ,
    // а байты брать как UTF-8 — значит поймать пару «длина сошлась, байты нет».
    // `timingSafeEqual` на такой паре бросает, и публичная точка записи падает
    // на одном специально собранном теле, без всякого подбора секрета.
    //
    // Поэтому проверяется не «кириллица отказывает», а «ни одна подпись не
    // роняет приём»: строки ниже — разные способы разойтись с настоящей подписью
    // (символы против байтов, кодировка, длина, мусор внутри алфавита).
    const stamp = String(NOW.getTime());
    const hostile = [
      "п".repeat(43), // длина в символах та же, в байтах вдвое больше
      "→".repeat(43), // три байта на символ
      "🙂".repeat(43), // суррогатные пары
      "a".repeat(43),
      "a".repeat(42),
      "a".repeat(44),
      "=".repeat(43),
      "+/+/".repeat(10),
      " ".repeat(43),
      "\u0000".repeat(43),
    ];

    for (const signature of hostile) {
      const read = () => readFillTicket(`${stamp}.${signature}`, SUBJECT, NOW);

      expect(read).not.toThrow();
      expect(read().ok).toBe(false);
    }
  });

  it("на границе суток пропуск ещё действует, за ней — нет", () => {
    // Выдаются по порядку времени, и это не придирка: время выдачи внутри процесса
    // не идёт вспять (`uniqueIssuedAt`), поэтому пропуск, выписанный вторым, не может
    // оказаться старше первого. Выпиши их наоборот — и проверка мерила бы не то.
    const past = issueFillTicket(
      SUBJECT,
      new Date(NOW.getTime() - FILL_TICKET_MAX_AGE_MS - 1),
    );
    const edge = issueFillTicket(
      SUBJECT,
      new Date(NOW.getTime() - FILL_TICKET_MAX_AGE_MS),
    );

    expect(readFillTicket(edge, SUBJECT, NOW).ok).toBe(true);
    expect(readFillTicket(past, SUBJECT, NOW)).toStrictEqual({
      ok: false,
      // Отдельный отказ, а не «мусор»: подпись верна, экран просто провисел
      // открытым слишком долго, и лечится это обновлением страницы.
      reason: "stale",
    });
  });

  it("долгое заполнение внутри суток остаётся долгим, а не подтягивается", () => {
    // Прежний предел в 12 часов стоял потому, что время называл браузер и «сутки
    // заполнения» означали сбитые часы. Время стало серверным: восемь часов —
    // это правда про планшет, который открыли утром, и врать про них незачем.
    const issued = new Date(NOW.getTime() - 8 * 60 * 60 * 1000);

    expect(
      readFillTicket(issueFillTicket(SUBJECT, issued), SUBJECT, NOW),
    ).toStrictEqual({ ok: true, value: issued.getTime() });
  });

  it("часы сервера шагнули назад — длительность нулевая, а не отрицательная", () => {
    const ticket = issueFillTicket(
      SUBJECT,
      new Date(NOW.getTime() + 5 * 60 * 1000),
    );

    const pass = readFillTicket(ticket, SUBJECT, NOW);

    expect(pass).toStrictEqual({ ok: true, value: NOW.getTime() });
  });

  it("два экрана, выданные в одну миллисекунду, получают разные пропуски", () => {
    // Пара «версия + начало» опознаёт отправку, и совпадение начала слило бы
    // заполнение второго сотрудника в квитанцию первого. Проверка неочевидная:
    // при сдвиге часов вперёд она зеленела бы сама, поэтому время одно и то же.
    const first = issueFillTicket(SUBJECT, NOW);
    const second = issueFillTicket(SUBJECT, NOW);

    expect(first).not.toBe(second);
    // Читаются они позже мига выдачи — как и бывает: отправка не случается в ту же
    // миллисекунду, в которую экран ушёл в браузер. Прочитанные ровно в миг выдачи,
    // оба подтянулись бы к «сейчас» заслоном от часов, шагнувших назад.
    const read = new Date(NOW.getTime() + 1000);
    const a = readFillTicket(first, SUBJECT, read);
    const b = readFillTicket(second, SUBJECT, read);
    expect(a.ok && b.ok && a.value !== b.value).toBe(true);
  });
});
