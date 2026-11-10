// Сторож замков демо-режима (D193): у каждого серверного действия и обработчика маршрута
// есть РЕШЕНИЕ — закрыто в демо или открыто, и почему.
//
// Зачем. В демо входят выбором роли, а учётки общие для всех посетителей: смена пароля,
// снятие учётки или привязка почты ломали бы вход остальным; вход паролем и через Google
// и всё, что шлёт наружу, демо-стенду не нужно и вредно. Новое действие с учётками, о
// котором забыли, молча остаётся открытым. Поэтому список решений живёт здесь, одним
// местом, а тест падает на любой функции без записи и на записи без функции.
//
// Что проверяется: (1) все экспортируемые функции файлов с директивой серверного действия
// и все обработчики `route.ts` названы в списке; (2) у «закрытого» в теле стоит вызов
// замка; (3) поведение самых важных замков — вживую, при DEMO_MODE=1.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withoutComments } from "@/blocks/core/source-text";
import { repositoryRoot } from "@/blocks/core/repo-copy";

type Decision =
  | { readonly kind: "locked" }
  | { readonly kind: "via"; readonly via: string }
  | { readonly kind: "open"; readonly why: string };

const locked: Decision = { kind: "locked" };
const open = (why: string): Decision => ({ kind: "open", why });

/** Ключ — «файл#функция». Закрыто всё, что про учётки, вход и внешние службы. */
const DECISIONS: Readonly<Record<string, Decision>> = {
  // Вход и сессия.
  "src/blocks/auth/actions.ts#signIn": locked,
  "src/blocks/auth/actions.ts#signOut": open(
    "убирает только свою куку: «сменить роль» в демо — это выход на /demo",
  ),
  "src/blocks/auth/ui/login-action.ts#submitLogin": {
    kind: "via",
    via: "signIn",
  },
  "src/blocks/auth/ui/sign-out-action.ts#submitSignOut": open(
    "выход ведёт на /demo",
  ),
  "src/app/(public)/admin/login/google/route.ts#GET": locked,
  "src/app/(public)/admin/login/google/callback/route.ts#GET": locked,
  "src/app/demo/enter/route.ts#POST": open(
    "сам и есть вход демо; без DEMO_MODE — 404",
  ),
  "src/app/demo/enter/route.ts#GET": open("только перенаправляет на /demo"),
  // Учётки и партнёры.
  "src/blocks/auth/ui/partners-action.ts#submitCreatePartner": locked,
  "src/blocks/auth/ui/partners-action.ts#submitChangePassword": locked,
  "src/blocks/auth/ui/partners-action.ts#submitResetPassword": locked,
  "src/blocks/auth/ui/partners-action.ts#submitDisableAccount": locked,
  "src/blocks/auth/ui/partners-action.ts#submitBindEmail": locked,
  "src/blocks/auth/ui/partners-action.ts#submitCreateHqMember": locked,
  // Язык и служебное.
  "src/blocks/core/ui/locale-action.ts#chooseLocale": open(
    "ставит куку языка; в демо язык всегда английский и переключатель скрыт",
  ),
  "src/app/healthz/route.ts#GET": open("проверка живости, без данных"),
  // Рабочие данные: сбрасываются часовым пересевом.
  "src/blocks/stations/ui/actions.ts#submitAssignChecklist":
    open("рабочие данные"),
  "src/blocks/stations/ui/actions.ts#submitDetachChecklist":
    open("рабочие данные"),
  "src/blocks/stations/ui/actions.ts#submitReissueCode": open("рабочие данные"),
  "src/blocks/stations/ui/actions.ts#submitCopyToStations":
    open("рабочие данные"),
  "src/blocks/fill/ui/alarm-action.ts#setAlarmAction": open(
    "заполнение, без входа",
  ),
  "src/blocks/fill/ui/alarm-action.ts#dropAlarmAction": open(
    "заполнение, без входа",
  ),
  "src/blocks/fill/ui/round-action.ts#markRoundAction": open(
    "заполнение, без входа",
  ),
  "src/blocks/fill/ui/shift-mode-action.ts#chooseShiftModeAction": open(
    "заполнение, без входа",
  ),
  "src/blocks/fill/ui/submit-action.ts#submitFillAction": open(
    "заполнение, без входа",
  ),
  "src/blocks/catalog/ui/actions.ts#submitCreateCountry": open(
    "справочник, рабочие данные",
  ),
  "src/blocks/catalog/ui/actions.ts#submitUpdateCountry": open(
    "справочник, рабочие данные",
  ),
  "src/blocks/catalog/ui/actions.ts#submitDeleteCountry": open(
    "справочник, рабочие данные",
  ),
  "src/blocks/catalog/ui/actions.ts#submitCreateStore": open(
    "справочник, рабочие данные",
  ),
  "src/blocks/catalog/ui/actions.ts#submitUpdateStore": open(
    "справочник, рабочие данные",
  ),
  "src/blocks/catalog/ui/actions.ts#submitDeleteStore": open(
    "справочник, рабочие данные",
  ),
  "src/blocks/catalog/ui/actions.ts#submitCreateStation": open(
    "справочник, рабочие данные",
  ),
  "src/blocks/catalog/ui/actions.ts#submitUpdateStation": open(
    "справочник, рабочие данные",
  ),
  "src/blocks/catalog/ui/actions.ts#submitDeleteStation": open(
    "справочник, рабочие данные",
  ),
  "src/blocks/catalog/ui/actions.ts#submitReissueCode": open(
    "справочник, рабочие данные",
  ),
  "src/blocks/catalog/ui/actions.ts#submitAssignChecklist": open(
    "справочник, рабочие данные",
  ),
  "src/blocks/catalog/ui/actions.ts#submitDetachChecklist": open(
    "справочник, рабочие данные",
  ),
  "src/blocks/library/actions.ts#submitCreateBlock": open(
    "библиотека, рабочие данные",
  ),
  "src/blocks/library/actions.ts#submitSaveBlock": open(
    "библиотека, рабочие данные",
  ),
  "src/blocks/editor/actions.ts#submitCreateChecklist": open(
    "чек-листы, рабочие данные",
  ),
  "src/blocks/editor/actions.ts#submitTakeTemplate": open(
    "чек-листы, рабочие данные",
  ),
  "src/blocks/editor/actions.ts#submitSaveDraft": open(
    "чек-листы, рабочие данные",
  ),
  "src/blocks/editor/actions.ts#submitPublish": open(
    "чек-листы, рабочие данные",
  ),
  "src/blocks/editor/actions.ts#submitDeleteChecklist": open(
    "чек-листы, рабочие данные",
  ),
  "src/blocks/editor/actions.ts#submitDuplicate": open(
    "чек-листы, рабочие данные",
  ),
  "src/blocks/editor/actions.ts#submitMakeTemplate": open(
    "чек-листы, рабочие данные",
  ),
  "src/blocks/editor/actions.ts#submitDismissTemplateUpdate": open(
    "чек-листы, рабочие данные",
  ),
  "src/blocks/editor/actions.ts#submitTakeTemplateChanges": open(
    "чек-листы, рабочие данные",
  ),
  "src/blocks/device/ui/issue-pin-action.ts#issuePinAction": open(
    "планшет станции, не учётка",
  ),
  "src/blocks/device/ui/unlink-action.ts#unlinkDevice": open(
    "планшет станции, не учётка",
  ),
  "src/blocks/device/ui/pair-action.ts#pairAction": open(
    "планшет станции, не учётка",
  ),
  "src/app/admin/qr/code/route.ts#GET": open("картинка QR, только чтение"),
  "src/app/admin/qr/sticker/route.ts#GET": open("наклейка QR, только чтение"),
};

const LOCK_CALLS = ["isDemoMode(", "requireHqOutsideDemo(", "hideInDemo("];
const SERVER_ACTION_DIRECTIVE = /^"use server";$/m;
const EXPORTED_FUNCTION = /^export (?:async )?function (\w+)/gm;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

interface Found {
  readonly key: string;
  readonly body: string;
}

/** Все функции, которые браузер может вызвать: действия сервера и обработчики маршрутов. */
function callableFunctions(): Found[] {
  const root = repositoryRoot();
  const found: Found[] = [];
  for (const path of sourceFiles(join(root, "src"))) {
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) continue;
    const raw = readFileSync(path, "utf8");
    const isRoute = /[\\/]route\.ts$/.test(path);
    // Директиву ищем в исходнике как есть: в тексте без комментариев она на месте, но
    // упоминание в пояснении («"use server"» в комментарии) не считается.
    const text = withoutComments(raw);
    if (!isRoute && !SERVER_ACTION_DIRECTIVE.test(text)) continue;
    const file = relative(root, path).split("\\").join("/");
    const starts = [...text.matchAll(EXPORTED_FUNCTION)];
    starts.forEach((match, index) => {
      const next = starts[index + 1]?.index ?? text.length;
      found.push({
        key: `${file}#${match[1] ?? ""}`,
        body: text.slice(match.index, next),
      });
    });
  }
  return found;
}

describe("замки демо-режима: у каждого действия есть решение", () => {
  const callable = callableFunctions();

  it("находит действия и маршруты (сторож не слепой)", () => {
    expect(callable.length).toBeGreaterThan(30);
    expect(callable.map((f) => f.key)).toContain(
      "src/blocks/auth/ui/partners-action.ts#submitResetPassword",
    );
  });

  it("каждая функция названа в списке решений", () => {
    const missing = callable
      .map((f) => f.key)
      .filter((key) => DECISIONS[key] === undefined);
    expect(
      missing,
      `Новое действие или маршрут без решения для демо-режима. Если оно трогает учётки, вход или внешние службы — закрой его (isDemoMode / requireHqOutsideDemo) и запиши «locked» в src/app/demo/demo-locks.test.ts; иначе запиши «open» с причиной:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("в списке нет записей про несуществующие функции", () => {
    const real = new Set(callable.map((f) => f.key));
    const stale = Object.keys(DECISIONS).filter((key) => !real.has(key));
    expect(stale, `Устаревшие записи:\n${stale.join("\n")}`).toEqual([]);
  });

  it("у каждой закрытой функции в теле стоит вызов замка", () => {
    const unlocked = callable.filter((f) => {
      const decision = DECISIONS[f.key];
      if (decision?.kind === "locked") {
        return !LOCK_CALLS.some((call) => f.body.includes(call));
      }
      if (decision?.kind === "via") return !f.body.includes(`${decision.via}(`);
      return false;
    });
    expect(
      unlocked.map((f) => f.key),
      "Решение «закрыто», а замка в теле функции нет",
    ).toEqual([]);
  });
});

describe("замки демо-режима: поведение вживую", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("вход паролем отказывает в демо-режиме, не дойдя до проверки пароля", async () => {
    const { signIn } = await import("@/blocks/auth/actions");
    await expect(signIn("demo-hq", "whatever-password")).resolves.toEqual({
      status: "rejected",
    });
  });

  it("все действия экрана «Партнёры» отвечают «такого адреса нет»", async () => {
    const actions = await import("@/blocks/auth/ui/partners-action");
    const calls = [
      actions.submitCreatePartner,
      actions.submitChangePassword,
      actions.submitResetPassword,
      actions.submitDisableAccount,
      actions.submitBindEmail,
      actions.submitCreateHqMember,
    ];
    for (const action of calls) {
      await expect(
        action({ status: "idle" }, new FormData()),
      ).rejects.toMatchObject({
        digest: expect.stringContaining("404") as unknown,
      });
    }
  });

  it("маршруты Google отвечают 403", async () => {
    const start = await import("../(public)/admin/login/google/route");
    const callback =
      await import("../(public)/admin/login/google/callback/route");
    expect((await start.GET()).status).toBe(403);
    const request = { nextUrl: new URL("http://localhost/x") };
    expect(
      (await callback.GET(request as Parameters<typeof callback.GET>[0]))
        .status,
    ).toBe(403);
  });
});
