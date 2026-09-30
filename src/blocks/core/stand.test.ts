import { describe, expect, test } from "vitest";

import { claimStand, foreignStandMessage, type StandStore } from "./stand";

interface Marker {
  copy_id: string;
  root: string;
}

/**
 * Поддельный сервер: помнит метки по базам и записывает все запросы, чтобы тест мог
 * утверждать не только результат, но и то, что проверка ничего не сносит.
 */
function fakeServer(initial: Record<string, Marker> = {}): {
  store: StandStore;
  sql: string[];
} {
  const sql: string[] = [];
  const markers = new Map(Object.entries(initial));

  return {
    sql,
    store: {
      // eslint-disable-next-line @typescript-eslint/require-await -- подделка синхронна
      async query(text: string, params?: readonly unknown[]) {
        sql.push(text);
        const database = String(params?.[0]);
        if (text.startsWith("insert")) {
          if (markers.has(database)) return { rows: [] };
          const marker = {
            copy_id: String(params?.[1]),
            root: String(params?.[2]),
          };
          markers.set(database, marker);
          return { rows: [{ copy_id: marker.copy_id }] };
        }
        if (text.startsWith("select")) {
          const marker = markers.get(database);
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
  test("на чистом сервере ставит свою метку и признаёт базу своей", async () => {
    const { store } = fakeServer();

    const result = await claimStand(store, "meridius", OWN);

    expect(result).toEqual({ kind: "own", claimed: true });
  });

  test("свою метку признаёт своей и второй раз не переставляет", async () => {
    const { store } = fakeServer({
      meridius: { copy_id: OWN.copyId, root: OWN.root },
    });

    const result = await claimStand(store, "meridius", OWN);

    expect(result).toEqual({ kind: "own", claimed: false });
  });

  test("чужую метку на той же базе отдаёт отказом и называет копию-владельца", async () => {
    const { store } = fakeServer({ meridius: NEIGHBOUR });

    const result = await claimStand(store, "meridius", OWN);

    expect(result).toEqual({
      kind: "foreign",
      copyId: NEIGHBOUR.copy_id,
      root: NEIGHBOUR.root,
    });
  });

  // Сервер разработки один на все копии (туннель на MUSPELHEIM, решение 25.09.2026):
  // метка на весь сервер отказывала любой второй копии, и параллельная волна блоков
  // не могла прогнать ни одного теста. Делить сервер можно, делить базу — нет.
  test("соседняя копия со своей базой на том же сервере — не чужая", async () => {
    const { store } = fakeServer({ meridius: NEIGHBOUR });

    const result = await claimStand(store, "meridius_device", OWN);

    expect(result).toEqual({ kind: "own", claimed: true });
  });

  test("не сносит ничего: ни drop, ни delete, ни update в запросах", async () => {
    const { store, sql } = fakeServer({ meridius: NEIGHBOUR });

    await claimStand(store, "meridius", OWN);

    const dangerous = sql.filter((text) =>
      /\b(drop|delete|update|truncate)\b/i.test(text),
    );
    expect(dangerous).toEqual([]);
  });

  test("метка ставится в отдельной схеме, а не среди таблиц продукта", async () => {
    const { store, sql } = fakeServer();

    await claimStand(store, "meridius", OWN);

    expect(sql[0]).toContain("create schema if not exists stand");
    expect(sql.join("\n")).toContain("stand.claim");
  });
});

describe("текст отказа", () => {
  const refusal = foreignStandMessage(
    { kind: "foreign", copyId: NEIGHBOUR.copy_id, root: NEIGHBOUR.root },
    { target: "localhost:5433", database: "meridius", own: OWN },
  );

  test("называет адрес и базу, куда подключились", () => {
    expect(refusal).toContain("localhost:5433");
    expect(refusal).toContain("meridius");
  });

  test("называет обе копии путями, а не одними метками", () => {
    expect(refusal).toContain(NEIGHBOUR.root);
    expect(refusal).toContain(OWN.root);
  });

  test("говорит, что делать: своя база в DATABASE_URL", () => {
    expect(refusal).toContain("DATABASE_URL");
  });

  test("даёт выход тому, кто делит базу осознанно", () => {
    expect(refusal).toContain(
      "delete from stand.claim where database = 'meridius'",
    );
  });
});
