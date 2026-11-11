// Вход в открытое демо без пароля (D194). Ядро — ошибка здесь открывает кабинет всем:
// без флага вход обязан не существовать, чужая страница не вправе его запускать.
import { describe, expect, test, vi } from "vitest";

import { enterDemo, isSameOrigin } from "./demo-entry";

const ON = { DEMO_MODE: "1" };
const OWN = {
  origin: "https://demo.example",
  host: "demo.example",
  forwardedHost: null,
};

function deps(account: { id: string } | null = { id: "acc-1" }) {
  return {
    findAccount: vi.fn(() => Promise.resolve(account)),
    setSession: vi.fn(() => Promise.resolve()),
    secret: () => "s".repeat(40),
    now: () => new Date("2026-11-11T10:00:00Z"),
  };
}

describe("enterDemo", () => {
  test("без DEMO_MODE=1 — нет такого адреса, и ни учётка, ни сессия не тронуты", async () => {
    for (const env of [{}, { DEMO_MODE: "true" }]) {
      const d = deps();
      expect(await enterDemo({ roleKey: "hq", ...OWN }, d, env)).toEqual({
        kind: "not-found",
      });
      expect(d.findAccount).not.toHaveBeenCalled();
      expect(d.setSession).not.toHaveBeenCalled();
    }
  });

  test("чужой ключ роли — нет такого адреса", async () => {
    const d = deps();
    for (const roleKey of ["root", "admin", "", "HQ", "demo-hq"]) {
      expect(await enterDemo({ roleKey, ...OWN }, d, ON)).toEqual({
        kind: "not-found",
      });
    }
    expect(d.setSession).not.toHaveBeenCalled();
  });

  test("чужой или пустой Origin — отказ без сессии", async () => {
    const d = deps();
    for (const origin of [
      null,
      "https://evil.example",
      "https://demo.example.evil.example",
    ]) {
      expect(await enterDemo({ roleKey: "hq", ...OWN, origin }, d, ON)).toEqual(
        { kind: "foreign-origin" },
      );
    }
    expect(d.setSession).not.toHaveBeenCalled();
  });

  test("учётки нет (идёт пересев) — «готовится», сессии нет", async () => {
    const d = deps(null);
    expect(await enterDemo({ roleKey: "partner", ...OWN }, d, ON)).toEqual({
      kind: "preparing",
    });
    expect(d.findAccount).toHaveBeenCalledWith("demo-partner");
    expect(d.setSession).not.toHaveBeenCalled();
  });

  test("роль находит свою учётку по логину и выпускает ей сессию", async () => {
    const d = deps({ id: "acc-9" });
    expect(await enterDemo({ roleKey: "hq", ...OWN }, d, ON)).toEqual({
      kind: "entered",
    });
    expect(d.findAccount).toHaveBeenCalledWith("demo-hq");
    expect(d.setSession).toHaveBeenCalledWith(
      "acc-9",
      "s".repeat(40),
      new Date("2026-11-11T10:00:00Z"),
    );
  });
});

describe("isSameOrigin", () => {
  test("совпадение схемы и хоста пропускает, остальное — нет", () => {
    expect(isSameOrigin("https://a.example", "a.example", null)).toBe(true);
    expect(isSameOrigin("https://a.example", "x:3000", "a.example")).toBe(true);
    expect(isSameOrigin("https://b.example", "a.example", null)).toBe(false);
    expect(isSameOrigin("не адрес", "a.example", null)).toBe(false);
    expect(isSameOrigin(null, "a.example", null)).toBe(false);
    expect(isSameOrigin("https://a.example", null, null)).toBe(false);
  });
});
