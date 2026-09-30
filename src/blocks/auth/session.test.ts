import { createHmac } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  ROOT_SUBJECT,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  readSessionToken,
} from "./session";

const SECRET = "секрет-подписи-сессии-достаточной-длины-для-проверки";
const OTHER_SECRET = "другой-секрет-подписи-сессии-такой-же-длины-хватит-";
const NOW = new Date("2026-09-06T10:00:00.000Z");
const SUBJECT = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";

function laterBy(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * 1000);
}

describe("createSessionToken", () => {
  test("выдаёт сессию на 30 дней", () => {
    const session = readSessionToken(
      createSessionToken(SUBJECT, SECRET, NOW),
      SECRET,
      NOW,
    );

    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(session?.expiresAt.toISOString()).toBe(
      laterBy(SESSION_MAX_AGE_SECONDS).toISOString(),
    );
    expect(session?.issuedAt.toISOString()).toBe(NOW.toISOString());
  });

  test("не кладёт секрет подписи внутрь самой куки", () => {
    const token = createSessionToken(SUBJECT, SECRET, NOW);

    expect(token).not.toContain(SECRET);
    expect(Buffer.from(token, "base64url").toString("utf8")).not.toContain(
      SECRET,
    );
    expect(token.length).toBeLessThan(300);
  });
});

// Кука с верной подписью, но с любым содержимым: так проверяется, что разбор содержимого
// не полагается на подпись. Подпись подтверждает только «это наша кука», не «она осмысленная».
function signedToken(rawPayload: string): string {
  const payload = Buffer.from(rawPayload).toString("base64url");
  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
}

describe("readSessionToken", () => {
  test("принимает свою же куку", () => {
    expect(
      readSessionToken(createSessionToken(SUBJECT, SECRET, NOW), SECRET, NOW),
    ).not.toBeNull();
  });

  test("принимает куку за секунду до истечения срока", () => {
    const token = createSessionToken(SUBJECT, SECRET, NOW);

    expect(
      readSessionToken(token, SECRET, laterBy(SESSION_MAX_AGE_SECONDS - 1)),
    ).not.toBeNull();
  });

  test("отвергает куку, у которой истёк срок", () => {
    const token = createSessionToken(SUBJECT, SECRET, NOW);

    expect(
      readSessionToken(token, SECRET, laterBy(SESSION_MAX_AGE_SECONDS + 1)),
    ).toBeNull();
  });

  test("отвергает куку, подписанную другим секретом", () => {
    const token = createSessionToken(SUBJECT, OTHER_SECRET, NOW);

    expect(readSessionToken(token, SECRET, NOW)).toBeNull();
  });

  test("отвергает подделанный срок жизни: подпись считается по содержимому", () => {
    const [payload, signature] = createSessionToken(SUBJECT, SECRET, NOW).split(
      ".",
    );
    const forged = JSON.parse(
      Buffer.from(payload ?? "", "base64url").toString("utf8"),
    ) as {
      exp: number;
    };
    forged.exp += 365 * 24 * 60 * 60;
    const tampered = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${signature ?? ""}`;

    expect(readSessionToken(tampered, SECRET, NOW)).toBeNull();
  });

  test("отвергает подделанную подпись", () => {
    const [payload] = createSessionToken(SUBJECT, SECRET, NOW).split(".");
    const tampered = `${payload ?? ""}.${Buffer.from("подпись-из-головы").toString("base64url")}`;

    expect(readSessionToken(tampered, SECRET, NOW)).toBeNull();
  });

  test("на мусоре возвращает null, а не падает", () => {
    const garbage = [
      "",
      ".",
      "..",
      "abc",
      "abc.def",
      "%%%.%%%",
      `${Buffer.from("не json").toString("base64url")}.${Buffer.from("x").toString("base64url")}`,
      `${Buffer.from(JSON.stringify({ exp: "скоро" })).toString("base64url")}.x`,
      createSessionToken(SUBJECT, SECRET, NOW).replace(".", "-"),
      `${createSessionToken(SUBJECT, SECRET, NOW)}.лишнее`,
    ];

    for (const token of garbage) {
      expect(readSessionToken(token, SECRET, NOW)).toBeNull();
    }
  });

  test("со своей подписью, но не-JSON внутри — отказ, а не исключение", () => {
    expect(readSessionToken(signedToken("не json"), SECRET, NOW)).toBeNull();
    expect(readSessionToken(signedToken('"строка"'), SECRET, NOW)).toBeNull();
    expect(readSessionToken(signedToken("null"), SECRET, NOW)).toBeNull();
  });

  test("со своей подписью, но чужой версией формата — отказ", () => {
    const future = JSON.stringify({ v: 99, iat: 0, exp: 4_000_000_000 });

    expect(readSessionToken(signedToken(future), SECRET, NOW)).toBeNull();
  });

  test("со своей подписью, но нечисловым сроком — отказ", () => {
    const wrong = JSON.stringify({
      v: 2,
      sub: SUBJECT,
      iat: "вчера",
      exp: "завтра",
    });

    expect(readSessionToken(signedToken(wrong), SECRET, NOW)).toBeNull();
  });

  test("отвергает пустую строку вместо куки, даже когда секрет пустой", () => {
    expect(readSessionToken("", "", NOW)).toBeNull();
  });

  test("несёт учётную запись, которой выдана", () => {
    const token = createSessionToken(SUBJECT, SECRET, NOW);
    expect(readSessionToken(token, SECRET, NOW)?.subject).toBe(SUBJECT);
    const root = createSessionToken(ROOT_SUBJECT, SECRET, NOW);
    expect(readSessionToken(root, SECRET, NOW)?.subject).toBe(ROOT_SUBJECT);
  });

  test("кука прежнего формата без учётной записи — отказ: её нельзя отнести ни к одному тенанту", () => {
    const legacy = JSON.stringify({
      v: 1,
      iat: 1_789_000_000,
      exp: 4_000_000_000,
    });
    expect(readSessionToken(signedToken(legacy), SECRET, NOW)).toBeNull();
  });

  test("учётная запись не того вида — отказ", () => {
    for (const sub of [42, "", "не-uuid", null]) {
      const wrong = JSON.stringify({
        v: 2,
        sub,
        iat: 1_789_000_000,
        exp: 4_000_000_000,
      });
      expect(readSessionToken(signedToken(wrong), SECRET, NOW)).toBeNull();
    }
  });

  test("выпустить куку на учётку не того вида нельзя", () => {
    expect(() => createSessionToken("не-uuid", SECRET, NOW)).toThrow();
  });
});
