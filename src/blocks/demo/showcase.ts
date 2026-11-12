// Демо-режим (D193): расширенный контур для открытого демо — три страны, семь пиццерий,
// шаблоны УК и 60 дней истории заполнений.
//
// Всё выдумано: названия стран и пиццерий не принадлежат реальной сети. Разметка чек-листов
// берётся из `dataset.ts` (утреннее открытие, вечернее закрытие, касса) и копируется на
// каждую новую пиццерию — второй набор разметки рядом с первым разошёлся бы с ним молча.
//
// История НЕ перечисляется, а порождается: для каждого чек-листа и каждых суток от 0 до 59
// назад решается, заполняли ли его, провалили ли пункт, сколько заняло. Решения берутся из
// детерминированного генератора по номеру чек-листа и суток, поэтому два прогона сида дают
// ровно то же, а «сегодня» всё равно сдвигается: сутки считаются назад от дня посева
// (`daysAgo`), так что через неделю демо не показывает ленту недельной давности.
import type {
  Item,
  LocalizedText,
  Section,
  ShiftMode,
  Severity,
} from "@/blocks/data";
import { flattenItems, sectionsForMode } from "@/blocks/data";

import { answersFor } from "./answers";
import { DEMO } from "./dataset";
import type {
  DemoAnswer,
  DemoChecklist,
  DemoDataset,
  DemoShiftMode,
  DemoStation,
  DemoStore,
  DemoSubmission,
  DemoTemplate,
} from "./model";
import {
  COUNTRY_FREEDONIA_ID,
  COUNTRY_RURITANIA_ID,
  DEMO_ACCOUNTS,
  DEMO_TENANTS,
  TENANT_FREEDONIA_ID,
  TENANT_RURITANIA_ID,
} from "./roles";

/** Глубина истории: сколько суток назад от дня посева заполнения ещё есть. */
export const HISTORY_DAYS = 60;

const MINUTES_IN_HOUR = 60;
/** Давно: все заполнения истории позже публикации версии (60 суток и запас). */
const PUBLISHED_HOURS_AGO = 1800;

// ---------- Опознаватели: счётчики, а не литералы, чтобы не плодить ошибок в 90 строках ----------

/** Постоянный uuid версии 4: префикс из двух знаков (вид строки) и порядковый номер. */
function uid(kind: string, serial: number): string {
  return `${kind}000000-0000-4000-8000-${serial.toString(16).padStart(12, "0")}`;
}

const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const CODE_TAIL_LENGTH = 7;
const CODE_STEP = 7919;

/** Код станции из алфавита наклейки: «shw» + семь знаков по номеру, постоянный между прогонами. */
function stationCode(serial: number): string {
  let rest = serial * CODE_STEP;
  let tail = "";
  for (let i = 0; i < CODE_TAIL_LENGTH; i += 1) {
    tail += CODE_ALPHABET.charAt(rest % CODE_ALPHABET.length);
    rest = Math.floor(rest / CODE_ALPHABET.length);
  }
  return `shw${tail}`;
}

// ---------- Генератор: детерминированный, по строке-ключу ----------

const HASH_MULTIPLIER = 31;
const UINT32 = 4_294_967_296;
const MULBERRY_INCREMENT = 0x6d2b79f5;
const MULBERRY_SHIFT_A = 15;
const MULBERRY_SHIFT_B = 7;
const MULBERRY_SHIFT_C = 14;
const MULBERRY_MIX = 61;

function hash(text: string): number {
  let value = 0;
  for (const char of text) {
    value = (Math.imul(value, HASH_MULTIPLIER) + char.charCodeAt(0)) >>> 0;
  }
  return value;
}

/** mulberry32: маленький генератор с постоянным результатом по зерну. Криптографии здесь нет и не нужно. */
function random(seed: string): () => number {
  let state = hash(seed);
  return () => {
    state = (state + MULBERRY_INCREMENT) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> MULBERRY_SHIFT_A), t | 1);
    t ^= t + Math.imul(t ^ (t >>> MULBERRY_SHIFT_B), t | MULBERRY_MIX);
    return ((t ^ (t >>> MULBERRY_SHIFT_C)) >>> 0) / UINT32;
  };
}

function pick<T>(items: readonly T[], next: () => number): T {
  const chosen = items[Math.floor(next() * items.length)];
  if (chosen === undefined) throw new Error("Выбирать не из чего");
  return chosen;
}

// ---------- Что писали сотрудники ----------

const NOTES: readonly string[] = [
  "Busy morning, lunch rush started early.",
  "Delivery arrived on time, everything checked.",
  "All tasks done before opening, a quiet start.",
  "Second oven heats slower than usual, maintenance informed.",
  "Two staff short today, covered by the shift lead.",
  "Cheese scale recalibrated before service.",
  "Order of large boxes arrives tomorrow, stock is low.",
  "Fridge door seal looks worn, worth replacing soon.",
  "New hire shadowed the opening routine.",
  "Nothing to report.",
];

const FAIL_COMMENTS: readonly string[] = [
  "Ran out of labels and fixed it later in the shift.",
  "Noticed during the check, corrected right away.",
  "Equipment issue, maintenance ticket opened.",
  "Missed during the rush, done after it calmed down.",
  "Waiting for a part, workaround in place.",
  "Staff reminded about the procedure.",
];

// ---------- Профили чек-листов ----------

type Kind = "morning" | "evening" | "counter";

interface Archetype {
  readonly kind: Kind;
  readonly stationName: string;
  readonly title: LocalizedText;
  readonly window: DemoChecklist["window"];
  readonly sections: readonly Section[];
  /** Когда заполняют, минуты от полуночи по местному времени: внутри окна чек-листа. */
  readonly slot: { readonly from: number; readonly to: number };
}

function archetypeOf(
  index: number,
  kind: Kind,
  stationName: string,
  slot: Archetype["slot"],
): Archetype {
  const checklist = DEMO.checklists[index];
  const published = checklist?.versions.find((v) => v.status === "published");
  if (checklist === undefined || published === undefined) {
    throw new Error(`В базовом контуре нет чек-листа №${String(index)}`);
  }
  return {
    kind,
    stationName,
    title: checklist.title,
    window: checklist.window,
    sections: published.sections,
    slot,
  };
}

function minutes(hours: number, rest = 0): number {
  return hours * MINUTES_IN_HOUR + rest;
}

const MORNING = archetypeOf(0, "morning", "Kitchen", {
  from: minutes(6, 30),
  to: minutes(10, 45),
});
const EVENING = archetypeOf(1, "evening", "Kitchen", {
  from: minutes(21, 30),
  to: minutes(23, 55),
});
const COUNTER = archetypeOf(2, "counter", "Front counter", {
  from: minutes(6, 30),
  to: minutes(10),
});
const ARCHETYPES: readonly Archetype[] = [MORNING, EVENING, COUNTER];

function clock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / MINUTES_IN_HOUR);
  const rest = totalMinutes % MINUTES_IN_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

// ---------- Одно заполнение ----------

/** Поведение пиццерии: насколько регулярно заполняют и как часто проваливают пункты. */
interface Behaviour {
  /** Вероятность, что в эти сутки чек-лист вообще заполнили. */
  readonly reliability: number;
  /** Вероятность провала хотя бы одного пункта в обычные сутки. */
  readonly failRate: number;
  /**
   * Куда движется качество: положительное — раньше было хуже (пиццерия подтягивается),
   * отрицательное — раньше было лучше (разваливается). Нужно, чтобы «Статистика» показывала
   * динамику, а не ровную полосу.
   */
  readonly trend: number;
}

/** Что заполняют: разметка может зависеть от суток (версия чек-листа менялась). */
interface Track {
  readonly checklistId: string;
  readonly stationId: string;
  readonly kind: Kind;
  readonly slot: Archetype["slot"];
  readonly behaviour: Behaviour;
  readonly versionFor: (daysAgo: number) => {
    readonly id: string;
    readonly sections: readonly Section[];
  };
}

const CRITICAL_SHARE = 0.22;
const UNANSWERED_CHANCE = 0.025;
const REDUCED_EVENING_CHANCE = 0.07;
const MIN_FAIL_CHANCE = 0.02;
const MAX_FAIL_CHANCE = 0.8;
const MIN_DURATION = 3;
const DURATION_SPREAD = 10;

function isFailable(item: Item): boolean {
  return item.type === "bool" || item.type === "number";
}

function numbersFor(
  items: readonly Item[],
  skipped: ReadonlySet<string>,
  next: () => number,
): number[] {
  return items
    .filter((item) => item.type === "number" && !skipped.has(item.id))
    .map((item) => {
      const min = item.min ?? 0;
      const max = item.max ?? min;
      return min + Math.floor(next() * (max - min + 1));
    });
}

function severityPool(items: readonly Item[], severity: Severity): Item[] {
  return items.filter((item) => isFailable(item) && item.severity === severity);
}

function buildSubmission(
  track: Track,
  daysAgo: number,
  serial: number,
): DemoSubmission | null {
  const { behaviour } = track;
  const next = random(`${track.checklistId}:${String(daysAgo)}`);

  // Вечернее закрытие сегодня ещё впереди: показывать его заполненным было бы враньём.
  if (daysAgo === 0 && track.kind === "evening") return null;
  if (next() > behaviour.reliability) return null;

  const version = track.versionFor(daysAgo);
  const mode: ShiftMode =
    track.kind === "evening" && next() < REDUCED_EVENING_CHANCE
      ? "reduced"
      : "normal";
  const sections =
    mode === "normal"
      ? [...version.sections]
      : sectionsForMode(version.sections, mode);
  const items = flattenItems(sections);

  const failChance = Math.min(
    MAX_FAIL_CHANCE,
    Math.max(
      MIN_FAIL_CHANCE,
      behaviour.failRate * (1 + (behaviour.trend * daysAgo) / HISTORY_DAYS),
    ),
  );
  const critical = severityPool(items, "critical");
  const ordinary = items.filter(
    (item) => isFailable(item) && item.severity !== "critical",
  );

  let failed: { itemId: string; comment: string } | undefined;
  let unanswered: string[] = [];
  if (next() < failChance) {
    const useCritical = critical.length > 0 && next() < CRITICAL_SHARE;
    const pool = useCritical || ordinary.length === 0 ? critical : ordinary;
    if (pool.length > 0) {
      failed = {
        itemId: pick(pool, next).id,
        comment: pick(FAIL_COMMENTS, next),
      };
    }
  } else if (critical.length > 0 && next() < UNANSWERED_CHANCE) {
    unanswered = [pick(critical, next).id];
  }

  const skipped = new Set([...unanswered, ...(failed ? [failed.itemId] : [])]);
  const answers: DemoAnswer[] = answersFor(sections, {
    note: pick(NOTES, next),
    numbers: numbersFor(items, skipped, next),
    ...(failed === undefined ? {} : { failed }),
    unanswered,
  });

  const at =
    track.slot.from + Math.floor(next() * (track.slot.to - track.slot.from));
  return {
    id: uid("e7", serial),
    versionId: version.id,
    stationId: track.stationId,
    daysAgo,
    at: clock(at),
    durationMinutes: MIN_DURATION + Math.floor(next() * DURATION_SPREAD),
    answers,
    mode,
  };
}

/** История одного чек-листа. `covered` — сутки, на которые уже есть свои заполнения (базовый контур). */
function historyOf(
  track: Track,
  covered: ReadonlySet<number>,
  firstSerial: number,
): DemoSubmission[] {
  const history: DemoSubmission[] = [];
  let serial = firstSerial;
  for (let daysAgo = 0; daysAgo < HISTORY_DAYS; daysAgo += 1) {
    if (covered.has(daysAgo)) continue;
    const submission = buildSubmission(track, daysAgo, serial);
    if (submission === null) continue;
    history.push(submission);
    serial += 1;
  }
  return history;
}

// ---------- Новые страны и пиццерии ----------

interface StorePlan {
  readonly name: string;
  readonly behaviour: Behaviour;
  readonly shiftMode?: Omit<DemoShiftMode, "storeId">;
}

interface CountryPlan {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
  readonly tenantId: string;
  readonly stores: readonly StorePlan[];
}

const COUNTRY_PLANS: readonly CountryPlan[] = [
  {
    id: COUNTRY_FREEDONIA_ID,
    name: "Freedonia",
    timezone: "Europe/Berlin",
    tenantId: TENANT_FREEDONIA_ID,
    stores: [
      {
        name: "Freedonia, Harbor",
        behaviour: { reliability: 0.97, failRate: 0.12, trend: 0.6 },
        shiftMode: { mode: "reduced", staffPresent: 3, staffExpected: 5 },
      },
      {
        name: "Freedonia, Old Town",
        behaviour: { reliability: 0.92, failRate: 0.22, trend: 0 },
      },
      {
        name: "Freedonia, Airport",
        behaviour: { reliability: 0.84, failRate: 0.34, trend: -0.4 },
        shiftMode: { mode: "critical", staffPresent: 1, staffExpected: 4 },
      },
    ],
  },
  {
    id: COUNTRY_RURITANIA_ID,
    name: "Ruritania",
    timezone: "Europe/Warsaw",
    tenantId: TENANT_RURITANIA_ID,
    stores: [
      {
        name: "Ruritania, Market Street",
        behaviour: { reliability: 0.95, failRate: 0.16, trend: 0.3 },
      },
      {
        name: "Ruritania, Lakeside",
        behaviour: { reliability: 0.8, failRate: 0.3, trend: 0 },
      },
    ],
  },
];

/** Сквозные номера по всему демо-режиму: заполнения, пиццерии, станции, чек-листы. */
interface Counters {
  store: number;
  station: number;
  checklist: number;
  submission: number;
}

function newCountryDataset(plan: CountryPlan, counters: Counters): DemoDataset {
  const stores: DemoStore[] = [];
  const stations: DemoStation[] = [];
  const checklists: DemoChecklist[] = [];
  const submissions: DemoSubmission[] = [];
  const shiftModes: DemoShiftMode[] = [];

  for (const storePlan of plan.stores) {
    counters.store += 1;
    const storeId = uid("e1", counters.store);
    stores.push({ id: storeId, name: storePlan.name, timezone: plan.timezone });
    if (storePlan.shiftMode !== undefined) {
      shiftModes.push({ storeId, ...storePlan.shiftMode });
    }

    const stationIds = new Map<string, string>();
    for (const stationName of new Set(ARCHETYPES.map((a) => a.stationName))) {
      counters.station += 1;
      const id = uid("e2", counters.station);
      stationIds.set(stationName, id);
      stations.push({
        id,
        storeId,
        name: stationName,
        code: stationCode(counters.station),
      });
    }

    for (const archetype of ARCHETYPES) {
      counters.checklist += 1;
      const stationId = stationIds.get(archetype.stationName);
      if (stationId === undefined) throw new Error("Станция не заведена");
      const versionId = uid("e6", counters.checklist);
      checklists.push({
        id: uid("e4", counters.checklist),
        stationId,
        tenantId: plan.tenantId,
        title: archetype.title,
        window: archetype.window,
        draft: {
          id: uid("e5", counters.checklist),
          sections: [...archetype.sections],
        },
        versions: [
          {
            id: versionId,
            versionNumber: 1,
            status: "published",
            sections: [...archetype.sections],
            publishedHoursAgo: PUBLISHED_HOURS_AGO,
          },
        ],
      });
      const history = historyOf(
        {
          checklistId: uid("e4", counters.checklist),
          stationId,
          kind: archetype.kind,
          slot: archetype.slot,
          behaviour: storePlan.behaviour,
          versionFor: () => ({ id: versionId, sections: archetype.sections }),
        },
        new Set(),
        counters.submission + 1,
      );
      counters.submission += history.length;
      submissions.push(...history);
    }
  }

  return {
    country: { id: plan.id, name: plan.name, locale: "en" },
    stores,
    stations,
    blocks: [],
    checklists,
    submissions,
    shiftModes,
    tenants: DEMO_TENANTS.filter((tenant) => tenant.id === plan.tenantId),
    accounts: DEMO_ACCOUNTS.filter(
      (account) => account.tenantId === plan.tenantId,
    ),
  };
}

// ---------- Первая страна: прежняя Demoland получает историю и шаблоны УК ----------

function templatesOf(): DemoTemplate[] {
  return ARCHETYPES.map((archetype, index) => {
    const serial = index + 1;
    return {
      id: uid("ea", serial),
      title: {
        en: `Standard ${archetype.title["en"]?.toLowerCase() ?? "checklist"}`,
      },
      window: archetype.window,
      draft: { id: uid("eb", serial), sections: [...archetype.sections] },
      versions: [
        {
          id: uid("ec", serial),
          versionNumber: 1,
          status: "published",
          sections: [...archetype.sections],
          publishedHoursAgo: PUBLISHED_HOURS_AGO,
        },
      ],
    };
  });
}

/** Поведение пиццерий Demoland: история у них та же, что у остальных, — свои подъёмы и провалы. */
const DEMOLAND_BEHAVIOUR: Readonly<Record<string, Behaviour>> = {
  "Morning opening — Kitchen": { reliability: 0.94, failRate: 0.2, trend: 0.3 },
  "Evening closing — Kitchen": { reliability: 0.9, failRate: 0.26, trend: 0 },
  "Counter opening — Front desk": {
    reliability: 0.92,
    failRate: 0.18,
    trend: 0.2,
  },
};

function extendDemoland(counters: Counters): DemoDataset {
  const versionOwner = new Map(
    DEMO.checklists.flatMap((checklist) =>
      checklist.versions.map((version) => [version.id, checklist.id] as const),
    ),
  );
  const submissions: DemoSubmission[] = [];

  for (const checklist of DEMO.checklists) {
    const behaviour = DEMOLAND_BEHAVIOUR[checklist.title["en"] ?? ""];
    const published = checklist.versions.find((v) => v.status === "published");
    const earlier = checklist.versions.find((v) => v.status === "archived");
    if (behaviour === undefined || published === undefined) continue;

    const archetype = ARCHETYPES.find(
      (a) => a.title["en"] === checklist.title["en"],
    );
    if (archetype === undefined) continue;

    const covered = new Set(
      DEMO.submissions
        .filter((s) => versionOwner.get(s.versionId) === checklist.id)
        .map((s) => s.daysAgo),
    );
    const publishedDaysAgo = Math.floor(published.publishedHoursAgo / 24);
    const history = historyOf(
      {
        checklistId: checklist.id,
        stationId: checklist.stationId,
        kind: archetype.kind,
        slot: archetype.slot,
        behaviour,
        // Версия, действовавшая в те сутки: до публикации новой — прежняя.
        versionFor: (daysAgo) =>
          earlier !== undefined && daysAgo > publishedDaysAgo
            ? earlier
            : published,
      },
      covered,
      counters.submission + 1,
    );
    counters.submission += history.length;
    submissions.push(...history);
  }

  return {
    ...DEMO,
    submissions: [...DEMO.submissions, ...submissions],
    templates: templatesOf(),
    accounts: DEMO_ACCOUNTS.filter((account) => account.tenantId === undefined),
  };
}

/**
 * Описания контура демо-режима по странам. Первое несёт блок библиотеки, и сид заводит его
 * раньше остальных: чек-листы других стран вставляют этот блок в разделы.
 */
export function showcaseDatasets(): readonly DemoDataset[] {
  const counters: Counters = {
    store: 0,
    station: 0,
    checklist: 0,
    submission: 0,
  };
  const first = extendDemoland(counters);
  return [
    first,
    ...COUNTRY_PLANS.map((plan) => newCountryDataset(plan, counters)),
  ];
}
