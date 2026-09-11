import { describe, expect, test } from "vitest";

import { claimStand, foreignStandMessage, type StandStore } from "./stand";

/**
 * Поддельный сервер: помнит одну строку метки и записывает все запросы, чтобы тест
 * мог утверждать не только результат, но и то, что проверка ничего не сносит.
 */
function fakeServer(initial?: { copy_id: string; root: string }): {
  store: StandStore;
  sql: string[];
} {
  const sql: string[] = [];
  let marker = initial;

  return {
    sql,
    store: {
      // eslint-disable-next-line @typescript-eslint/require-await -- подделка синхронна
      async query(text: string, params?: readonly unknown[]) {
        sql.push(text);
        if (text.startsWith("insert")) {
          if (marker !== undefined) return { rows: [] };
          marker = { copy_id: String(params?.[0]), root: String(params?.[1]) };
          return { rows: [{ copy_id: marker.copy_id }] };
        }
        if (text.startsWith("select")) {
          return { rows: marker === undefined ? [] : [marker] };
        }
        return { rows: [] };
      },
    },
  };
}

const OWN = { copyId: "aaaa1111", root: "/copies/meridius-core" };
const NEIGHBOUR = { copy_id: "bbbb2222", root: "/copies/meridius-catalog" };

describe("метка стенда", () => {
  test("на чистом сервере ставит свою метку и признаёт стенд своим", async () => {
    const { store } = fakeServer();

    const result = await claimStand(store, OWN);

    expect(result).toEqual({ kind: "own", claimed: true });
  });

  test("свою метку признаёт своей и второй раз не переставляет", async () => {
    const { store } = fakeServer({ copy_id: OWN.copyId, root: OWN.root });

    const result = await claimStand(store, OWN);

    expect(result).toEqual({ kind: "own", claimed: false });
  });

  test("чужую метку отдаёт отказом и называет копию-владельца", async () => {
    const { store } = fakeServer(NEIGHBOUR);

    const result = await claimStand(store, OWN);

    expect(result).toEqual({
      kind: "foreign",
      copyId: NEIGHBOUR.copy_id,
      root: NEIGHBOUR.root,
    });
  });

  test("не сносит ничего: ни drop, ни delete, ни update в запросах", async () => {
    const { store, sql } = fakeServer(NEIGHBOUR);

    await claimStand(store, OWN);

    const dangerous = sql.filter((text) =>
      /\b(drop|delete|update|truncate)\b/i.test(text),
    );
    expect(dangerous).toEqual([]);
  });

  test("метка ставится в отдельной схеме, а не среди таблиц продукта", async () => {
    const { store, sql } = fakeServer();

    await claimStand(store, OWN);

    expect(sql[0]).toContain("create schema if not exists stand");
    expect(sql.join("\n")).toContain("stand.marker");
  });
});

describe("текст отказа", () => {
  const refusal = foreignStandMessage(
    { kind: "foreign", copyId: NEIGHBOUR.copy_id, root: NEIGHBOUR.root },
    { target: "localhost:5433", own: OWN },
  );

  test("называет адрес, куда подключились", () => {
    expect(refusal).toContain("localhost:5433");
  });

  test("называет обе копии путями, а не одними метками", () => {
    expect(refusal).toContain(NEIGHBOUR.root);
    expect(refusal).toContain(OWN.root);
  });

  test("говорит, что делать: свой порт и свой стенд", () => {
    expect(refusal).toContain("DB_PORT");
    expect(refusal).toContain("DATABASE_URL");
  });

  test("даёт выход тому, кто делит сервер осознанно", () => {
    expect(refusal).toContain("delete from stand.marker");
  });
});
