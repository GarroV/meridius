// В открытом демо ни одно действие экрана «Партнёры» не доходит до базы (D194): учётки
// общие, и смена пароля или снятие учётки роли ломала бы вход всем посетителям.
// Охрана входа подменена вошедшей УК, а работа с учётками — шпионом: проверяется ровно то,
// что отказ стоит ДО работы, а без флага работа по-прежнему вызывается.
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  submitBindEmail,
  submitChangePassword,
  submitCreateHqMember,
  submitCreatePartner,
  submitDisableAccount,
  submitResetPassword,
} from "./partners-action";
import { INITIAL_PARTNER_FORM } from "./partners-state";

const work = vi.hoisted(() => ({ calls: 0 }));

vi.mock("../guard", () => ({
  requireHq: () => Promise.resolve({ tenantKind: "hq" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../provision", () => ({
  provisionPartner: () => {
    work.calls += 1;
    return Promise.resolve({ ok: false, reason: "login-taken" });
  },
}));
vi.mock("../partners", () => ({
  changePartnerPassword: () => {
    work.calls += 1;
    return Promise.resolve({ ok: false, reason: "not-found" });
  },
  resetPartnerPassword: () => {
    work.calls += 1;
    return Promise.resolve({ ok: false, reason: "not-found" });
  },
  disablePartnerAccount: () => {
    work.calls += 1;
    return Promise.resolve({ ok: false, reason: "not-found" });
  },
}));
vi.mock("../emails", () => ({
  bindAccountEmail: () => {
    work.calls += 1;
    return Promise.resolve({ ok: false, reason: "not-found" });
  },
}));
vi.mock("../hq-members", () => ({
  provisionHqMember: () => {
    work.calls += 1;
    return Promise.resolve({ ok: false, reason: "login-taken" });
  },
}));

const ACCOUNT = "9d3f6f2a-0f1e-4a8b-8c2d-1f2b3c4d5e6f";
const ACTIONS = [
  submitCreatePartner,
  submitChangePassword,
  submitResetPassword,
  submitDisableAccount,
  submitBindEmail,
  submitCreateHqMember,
];

function form(): FormData {
  const data = new FormData();
  data.set("accountId", ACCOUNT);
  data.set("login", "someone");
  data.set("password", "длинный-пароль-12345");
  data.set("tenant", "T");
  data.set("country", "C");
  data.set("email", "a@b.example");
  return data;
}

afterEach(() => {
  vi.unstubAllEnvs();
  work.calls = 0;
});

describe("экран «Партнёры» в демо", () => {
  test("все шесть действий отказывают с кодом demo-locked и не работают", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    for (const action of ACTIONS) {
      const result = await action(INITIAL_PARTNER_FORM, form());
      expect(result).toEqual({ status: "failed", error: "demo-locked" });
    }
    expect(work.calls).toBe(0);
  });

  test("без флага действия работают как раньше", async () => {
    for (const action of ACTIONS) {
      await action(INITIAL_PARTNER_FORM, form());
    }
    expect(work.calls).toBe(ACTIONS.length);
  });
});
