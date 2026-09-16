// Содержимое демонстрационного контура (D_DEMO). Опознаватели зафиксированы константами
// (см. заголовок model.ts — это и есть механизм идемпотентности сида), а разметка чек-листов
// собрана через маленькие фабрики: тип пункта, флаг критичности и ключ локали "en" не должны
// повторяться литералами по всему файлу (`sonarjs/no-duplicate-string`), это единственное место,
// где они названы явно.
import type {
  Item,
  LocalizedText,
  ScheduleSegment,
  Section,
  Severity,
  ShiftMode,
} from "@/blocks/data";
import { sectionsForMode } from "@/blocks/data";

import { answersFor } from "./answers";
import type {
  DemoAnswer,
  DemoBlock,
  DemoChecklist,
  DemoCountry,
  DemoDataset,
  DemoShiftMode,
  DemoStation,
  DemoStore,
  DemoSubmission,
  DemoVersion,
} from "./model";

// ---------- Опознаватели строк базы ----------

const COUNTRY_ID = "d0000000-0000-4000-8000-000000000001";

const STORE_CENTRAL_ID = "d1000000-0000-4000-8000-000000000001";
const STORE_RIVERSIDE_ID = "d1000000-0000-4000-8000-000000000002";

const STATION_CENTRAL_KITCHEN_ID = "d2000000-0000-4000-8000-000000000001";
const STATION_CENTRAL_DOUGH_ID = "d2000000-0000-4000-8000-000000000002";
const STATION_CENTRAL_COUNTER_ID = "d2000000-0000-4000-8000-000000000003";
const STATION_RIVERSIDE_KITCHEN_ID = "d2000000-0000-4000-8000-000000000004";
const STATION_RIVERSIDE_COUNTER_ID = "d2000000-0000-4000-8000-000000000005";

const BLOCK_ID = "d3000000-0000-4000-8000-000000000001";

const CHECKLIST_MORNING_ID = "d4000000-0000-4000-8000-000000000001";
const CHECKLIST_EVENING_ID = "d4000000-0000-4000-8000-000000000002";
const CHECKLIST_COUNTER_ID = "d4000000-0000-4000-8000-000000000003";

const DRAFT_MORNING_ID = "d5000000-0000-4000-8000-000000000001";
const DRAFT_EVENING_ID = "d5000000-0000-4000-8000-000000000002";
const DRAFT_COUNTER_ID = "d5000000-0000-4000-8000-000000000003";

const VERSION_MORNING_V1_ID = "d6000000-0000-4000-8000-000000000001";
const VERSION_MORNING_V2_ID = "d6000000-0000-4000-8000-000000000002";
const VERSION_EVENING_V1_ID = "d6000000-0000-4000-8000-000000000003";
const VERSION_COUNTER_V1_ID = "d6000000-0000-4000-8000-000000000004";

/** Единственный пункт контура, который проваливает показательное заполнение. */
const ITEM_SAUCE_LABELS_ID = "item-sauce-labels";

// ---------- Мелкие фабрики: тип пункта и ключ локали называются один раз ----------

function loc(text: string): LocalizedText {
  return { en: text };
}

function boolItem(
  id: string,
  title: string,
  severity: Severity,
  hint?: string,
): Item {
  const item: Item = { id, title: loc(title), type: "bool", severity };
  return hint === undefined ? item : { ...item, hint: loc(hint) };
}

function numberItem(
  id: string,
  title: string,
  min: number,
  max: number,
  severity: Severity,
  hint?: string,
): Item {
  const item: Item = {
    id,
    title: loc(title),
    type: "number",
    severity,
    min,
    max,
  };
  return hint === undefined ? item : { ...item, hint: loc(hint) };
}

/**
 * Периодическая проверка — обход (D075). В демо он один и намеренно: показать надо,
 * что регулярность настраивается отрезками, а не завалить экран сеткой часов.
 */
function roundItem(
  id: string,
  title: string,
  schedule: readonly ScheduleSegment[],
  severity: Severity,
): Item {
  return {
    id,
    title: loc(title),
    type: "bool",
    severity,
    schedule: [...schedule],
  };
}

function textItem(id: string, title: string, hint?: string): Item {
  const item: Item = {
    id,
    title: loc(title),
    type: "text",
    severity: "normal",
  };
  return hint === undefined ? item : { ...item, hint: loc(hint) };
}

function ownSection(
  id: string,
  title: string,
  items: readonly Item[],
): Section {
  return { id, title: loc(title), source: "own", items: [...items] };
}

function blockSection(
  id: string,
  blockId: string,
  items: readonly Item[],
): Section {
  return {
    id,
    title: loc(FOOD_SAFETY_TITLE),
    source: { blockId },
    items: [...items],
  };
}

function submission(
  id: string,
  versionId: string,
  stationId: string,
  daysAgo: number,
  at: string,
  durationMinutes: number,
  answers: readonly DemoAnswer[],
  mode: ShiftMode = "normal",
): DemoSubmission {
  return {
    id,
    versionId,
    stationId,
    daysAgo,
    at,
    durationMinutes,
    answers: [...answers],
    mode,
  };
}

// ---------- Справочник: страна, две пиццерии, пять станций ----------

const COUNTRY: DemoCountry = { id: COUNTRY_ID, name: "Demoland", locale: "en" };

const STORE_CENTRAL: DemoStore = {
  id: STORE_CENTRAL_ID,
  name: "Demoland, Central Square",
  timezone: "Europe/Amsterdam",
};
const STORE_RIVERSIDE: DemoStore = {
  id: STORE_RIVERSIDE_ID,
  name: "Demoland, Riverside",
  timezone: "Europe/Amsterdam",
};
const STORES: DemoStore[] = [STORE_CENTRAL, STORE_RIVERSIDE];

// Коды из алфавита наклейки (без i, l, o, 0, 1) — постоянные, десять знаков, непохожие.
const STATION_CENTRAL_KITCHEN: DemoStation = {
  id: STATION_CENTRAL_KITCHEN_ID,
  storeId: STORE_CENTRAL_ID,
  name: "Kitchen",
  code: "dmcskt2394",
};
const STATION_CENTRAL_DOUGH: DemoStation = {
  id: STATION_CENTRAL_DOUGH_ID,
  storeId: STORE_CENTRAL_ID,
  name: "Dough room",
  code: "dmcsdgh358",
};
const STATION_CENTRAL_COUNTER: DemoStation = {
  id: STATION_CENTRAL_COUNTER_ID,
  storeId: STORE_CENTRAL_ID,
  name: "Front counter",
  code: "dmcsfrn672",
};
const STATION_RIVERSIDE_KITCHEN: DemoStation = {
  id: STATION_RIVERSIDE_KITCHEN_ID,
  storeId: STORE_RIVERSIDE_ID,
  name: "Kitchen",
  code: "dmrvskt459",
};
const STATION_RIVERSIDE_COUNTER: DemoStation = {
  id: STATION_RIVERSIDE_COUNTER_ID,
  storeId: STORE_RIVERSIDE_ID,
  name: "Front counter",
  code: "dmrvfrn283",
};
const STATIONS: DemoStation[] = [
  STATION_CENTRAL_KITCHEN,
  STATION_CENTRAL_DOUGH,
  STATION_CENTRAL_COUNTER,
  STATION_RIVERSIDE_KITCHEN,
  STATION_RIVERSIDE_COUNTER,
];

// ---------- Блок библиотеки D011: заведён один раз, вставлен в Morning и Evening ----------

const FOOD_SAFETY_TITLE = "Food safety basics";

const FOOD_SAFETY_ITEMS: Item[] = [
  numberItem(
    "item-fridge-temperature",
    "Fridge temperature is within safe range",
    1,
    5,
    "normal",
    "Read the digital thermometer on the middle shelf.",
  ),
  boolItem(
    ITEM_SAUCE_LABELS_ID,
    "Open sauce containers are labeled with today's date",
    "critical",
    "Unlabeled containers must be discarded before service.",
  ),
  boolItem(
    "item-hand-wash",
    "Staff washed hands before starting food prep",
    "critical",
  ),
  boolItem(
    "item-counter-sanitized",
    "Prep counter wiped down and sanitized",
    "normal",
    "Let the sanitizer sit for at least 60 seconds.",
  ),
];

const FOOD_SAFETY_BLOCK: DemoBlock = {
  id: BLOCK_ID,
  title: loc(FOOD_SAFETY_TITLE),
  items: FOOD_SAFETY_ITEMS,
};

// ---------- Чек-лист 1: Morning opening — Kitchen (Central Square · Kitchen, 05:00–17:00) ----------

const CHECKLIST_MORNING_ITEMS_V1: Item[] = [
  boolItem(
    "item-oven-preheated",
    "Ovens are preheated to operating temperature",
    "normal",
  ),
  numberItem(
    "item-delivery-temperature",
    "Morning delivery temperature checked and logged",
    0,
    8,
    "critical",
    "Reject the delivery if the reading is above 8°C.",
  ),
  boolItem(
    "item-pos-online",
    "POS system is online and printing receipts",
    "normal",
  ),
  boolItem(
    "item-morning-briefing",
    "Morning briefing with the shift completed",
    "normal",
  ),
  boolItem("item-trash-lined", "Trash bins are lined for the day", "normal"),
];
// Методист добавил пункт с заметками уже после публикации v1 — черновик и v2 идут дальше v1.
const CHECKLIST_MORNING_ITEMS_V2: Item[] = [
  ...CHECKLIST_MORNING_ITEMS_V1,
  textItem(
    "item-morning-notes",
    "Notes for the day shift",
    "Mention any missing ingredients or broken equipment.",
  ),
];

const CHECKLIST_MORNING_BLOCK_SECTION = blockSection(
  "section-morning-food-safety",
  BLOCK_ID,
  FOOD_SAFETY_ITEMS,
);
const CHECKLIST_MORNING_SECTIONS_V1: Section[] = [
  ownSection(
    "section-morning-prep",
    "Opening prep",
    CHECKLIST_MORNING_ITEMS_V1,
  ),
  CHECKLIST_MORNING_BLOCK_SECTION,
];
const CHECKLIST_MORNING_SECTIONS_V2: Section[] = [
  ownSection(
    "section-morning-prep",
    "Opening prep",
    CHECKLIST_MORNING_ITEMS_V2,
  ),
  CHECKLIST_MORNING_BLOCK_SECTION,
];

const VERSION_MORNING_V1: DemoVersion = {
  id: VERSION_MORNING_V1_ID,
  versionNumber: 1,
  status: "archived",
  sections: CHECKLIST_MORNING_SECTIONS_V1,
  publishedHoursAgo: 720,
};
const VERSION_MORNING_V2: DemoVersion = {
  id: VERSION_MORNING_V2_ID,
  versionNumber: 2,
  status: "published",
  sections: CHECKLIST_MORNING_SECTIONS_V2,
  publishedHoursAgo: 168,
};

const CHECKLIST_MORNING: DemoChecklist = {
  id: CHECKLIST_MORNING_ID,
  stationId: STATION_CENTRAL_KITCHEN_ID,
  title: loc("Morning opening — Kitchen"),
  window: { start: "05:00", end: "17:00" },
  draft: { id: DRAFT_MORNING_ID, sections: CHECKLIST_MORNING_SECTIONS_V2 },
  versions: [VERSION_MORNING_V1, VERSION_MORNING_V2],
};

// ---------- Чек-лист 2: Evening closing — Kitchen (та же станция, 17:00–05:00) ----------

const CHECKLIST_EVENING_ITEMS: Item[] = [
  // Пример владельца в чистом виде: критичный уровень — то, что нельзя не сделать
  // ни в какую смену. Именно этот пункт остаётся один, когда людей почти нет.
  boolItem(
    "item-gas-off",
    "Gas supply to the kitchen is shut off",
    "critical",
    "The valve behind the ovens, not just the switch.",
  ),
  boolItem(
    "item-equipment-off",
    "All cooking equipment is turned off",
    "major",
    "Check the pizza ovens last, they stay hot the longest.",
  ),
  numberItem(
    "item-freezer-temperature",
    "Walk-in freezer temperature logged before leaving",
    -22,
    -10,
    "major",
  ),
  boolItem(
    "item-trash-removed",
    "Trash removed from the kitchen to the outside bin",
    "major",
  ),
  boolItem(
    "item-floor-mopped",
    "Kitchen floor mopped and left to dry",
    "normal",
  ),
  boolItem(
    "item-manager-signoff",
    "Closing manager sign-off recorded",
    "normal",
  ),
  textItem("item-closing-notes", "Closing notes for tomorrow's opening shift"),
];

const CHECKLIST_EVENING_SECTIONS_V1: Section[] = [
  ownSection(
    "section-evening-closing",
    "Closing tasks",
    CHECKLIST_EVENING_ITEMS,
  ),
  blockSection("section-evening-food-safety", BLOCK_ID, FOOD_SAFETY_ITEMS),
];

const VERSION_EVENING_V1: DemoVersion = {
  id: VERSION_EVENING_V1_ID,
  versionNumber: 1,
  status: "published",
  sections: CHECKLIST_EVENING_SECTIONS_V1,
  publishedHoursAgo: 240,
};

const CHECKLIST_EVENING: DemoChecklist = {
  id: CHECKLIST_EVENING_ID,
  stationId: STATION_CENTRAL_KITCHEN_ID,
  title: loc("Evening closing — Kitchen"),
  window: { start: "17:00", end: "05:00" },
  draft: { id: DRAFT_EVENING_ID, sections: CHECKLIST_EVENING_SECTIONS_V1 },
  versions: [VERSION_EVENING_V1],
};

// ---------- Чек-лист 3: Counter opening — Front desk (Riverside · Front counter, 06:00–23:00) ----------

const CHECKLIST_COUNTER_REGISTER_ITEMS: Item[] = [
  boolItem(
    "item-cash-drawer",
    "Cash drawer counted and matches the float",
    "major",
    "Count twice before opening the register.",
  ),
  boolItem(
    "item-card-terminal",
    "Card terminal test transaction passed",
    "normal",
  ),
  boolItem(
    "item-napkins-stocked",
    "Napkins and cups are stocked at the counter",
    "normal",
  ),
  numberItem(
    "item-drink-fridge-temperature",
    "Drink fridge temperature logged",
    1,
    6,
    "major",
  ),
  textItem("item-opening-notes", "Opening notes for the counter shift"),
];
const CHECKLIST_COUNTER_CUSTOMER_ITEMS: Item[] = [
  boolItem("item-tables-wiped", "Tables and chairs wiped down", "normal"),
  boolItem(
    "item-menu-updated",
    "Menu boards updated with today's specials",
    "normal",
  ),
  boolItem("item-door-glass", "Entrance door glass cleaned", "normal"),
  boolItem("item-music-started", "Background music playlist started", "normal"),
  boolItem("item-ice-bin-refilled", "Ice bin cleaned and refilled", "normal"),
];

const CHECKLIST_COUNTER_SECTIONS_V1: Section[] = [
  ownSection(
    "section-counter-register",
    "Register setup",
    CHECKLIST_COUNTER_REGISTER_ITEMS,
  ),
  ownSection(
    "section-counter-customer",
    "Customer area",
    CHECKLIST_COUNTER_CUSTOMER_ITEMS,
  ),
  ownSection("section-counter-rounds", "Rounds", [
    roundItem(
      "item-toppings-line",
      "Toppings line: labels, lids and temperature",
      // Плотнее днём, реже к вечеру: ровно тот случай, ради которого расписание
      // задаётся набором отрезков, а не одним числом.
      [
        { from: "08:00", to: "16:00", everyMinutes: 60 },
        { from: "16:00", to: "23:00", everyMinutes: 120 },
      ],
      "critical",
    ),
  ]),
];

const VERSION_COUNTER_V1: DemoVersion = {
  id: VERSION_COUNTER_V1_ID,
  versionNumber: 1,
  status: "published",
  sections: CHECKLIST_COUNTER_SECTIONS_V1,
  publishedHoursAgo: 300,
};

const CHECKLIST_COUNTER: DemoChecklist = {
  id: CHECKLIST_COUNTER_ID,
  stationId: STATION_RIVERSIDE_COUNTER_ID,
  title: loc("Counter opening — Front desk"),
  window: { start: "06:00", end: "23:00" },
  draft: { id: DRAFT_COUNTER_ID, sections: CHECKLIST_COUNTER_SECTIONS_V1 },
  versions: [VERSION_COUNTER_V1],
};

// ---------- Заполнения: пять свежих, пять за неделю, два архивных ----------

const SUBMISSIONS: DemoSubmission[] = [
  submission(
    "d7000000-0000-4000-8000-000000000001",
    VERSION_MORNING_V2_ID,
    STATION_CENTRAL_KITCHEN_ID,
    0,
    "08:20",
    6,
    answersFor(CHECKLIST_MORNING_SECTIONS_V2, {
      numbers: [4, 3],
      note: "Second oven heats slower than usual, worth a look from maintenance.",
    }),
  ),
  submission(
    "d7000000-0000-4000-8000-000000000002",
    VERSION_MORNING_V2_ID,
    STATION_CENTRAL_KITCHEN_ID,
    0,
    "06:40",
    8,
    answersFor(CHECKLIST_MORNING_SECTIONS_V2, {
      note: "Busy morning, lunch rush started early.",
      failed: {
        itemId: ITEM_SAUCE_LABELS_ID,
        comment:
          "Ran out of date labels during the lunch rush; relabeled every open container by 11 am.",
      },
    }),
  ),
  submission(
    "d7000000-0000-4000-8000-000000000003",
    VERSION_EVENING_V1_ID,
    STATION_CENTRAL_KITCHEN_ID,
    2,
    "23:30",
    5,
    answersFor(CHECKLIST_EVENING_SECTIONS_V1, {
      numbers: [-15, 3],
      note: "Dough for tomorrow is proofing in the cold room, do not move it.",
    }),
  ),
  submission(
    "d7000000-0000-4000-8000-000000000004",
    VERSION_COUNTER_V1_ID,
    STATION_RIVERSIDE_COUNTER_ID,
    0,
    "07:10",
    4,
    answersFor(CHECKLIST_COUNTER_SECTIONS_V1, {
      numbers: [4],
      note: "Card terminal needed a restart before the test transaction went through.",
    }),
  ),
  submission(
    "d7000000-0000-4000-8000-000000000005",
    VERSION_COUNTER_V1_ID,
    STATION_RIVERSIDE_COUNTER_ID,
    0,
    "06:25",
    9,
    answersFor(CHECKLIST_COUNTER_SECTIONS_V1, {
      note: "Only two boxes of large cups left, reorder before the weekend.",
    }),
  ),
  submission(
    "d7000000-0000-4000-8000-000000000006",
    VERSION_MORNING_V2_ID,
    STATION_CENTRAL_KITCHEN_ID,
    1,
    "08:10",
    7,
    answersFor(CHECKLIST_MORNING_SECTIONS_V2, {
      note: "Delivery arrived ten minutes late but temperature was fine.",
    }),
  ),
  submission(
    "d7000000-0000-4000-8000-000000000007",
    VERSION_EVENING_V1_ID,
    STATION_CENTRAL_KITCHEN_ID,
    3,
    "22:50",
    10,
    answersFor(CHECKLIST_EVENING_SECTIONS_V1, {
      note: "Mop head replaced, the old one is worn through.",
    }),
  ),
  submission(
    "d7000000-0000-4000-8000-000000000008",
    VERSION_COUNTER_V1_ID,
    STATION_RIVERSIDE_COUNTER_ID,
    2,
    "07:05",
    3,
    answersFor(CHECKLIST_COUNTER_SECTIONS_V1, {
      note: "Register float verified twice, everything matched.",
    }),
  ),
  submission(
    "d7000000-0000-4000-8000-000000000009",
    VERSION_MORNING_V2_ID,
    STATION_CENTRAL_KITCHEN_ID,
    3,
    "07:45",
    11,
    answersFor(CHECKLIST_MORNING_SECTIONS_V2, {
      note: "Cheese portioning scale drifts, recalibrated it before service.",
    }),
  ),
  submission(
    "d7000000-0000-4000-8000-000000000010",
    VERSION_EVENING_V1_ID,
    STATION_CENTRAL_KITCHEN_ID,
    5,
    "23:10",
    12,
    answersFor(CHECKLIST_EVENING_SECTIONS_V1, {
      note: "All closing tasks finished early, a quiet night.",
    }),
  ),
  // Архивные: старше публикации v2 (168 ч назад) — правка чек-листа не переписывает историю.
  submission(
    "d7000000-0000-4000-8000-000000000011",
    VERSION_MORNING_V1_ID,
    STATION_CENTRAL_KITCHEN_ID,
    9,
    "08:05",
    6,
    answersFor(CHECKLIST_MORNING_SECTIONS_V1),
  ),
  submission(
    "d7000000-0000-4000-8000-000000000012",
    VERSION_MORNING_V1_ID,
    STATION_CENTRAL_KITCHEN_ID,
    14,
    "07:20",
    9,
    answersFor(CHECKLIST_MORNING_SECTIONS_V1, { numbers: [5, 2] }),
  ),
  // Вечернее закрытие в критичную смену: людей почти нет, и от станции ждали
  // только критичные пункты. Ответы собраны по той же матрице, что применил бы
  // экран, — иначе карточка показала бы «не отвечено» там, где не спрашивали.
  submission(
    "d7000000-0000-4000-8000-000000000013",
    VERSION_EVENING_V1_ID,
    STATION_CENTRAL_KITCHEN_ID,
    4,
    "23:40",
    2,
    answersFor(sectionsForMode(CHECKLIST_EVENING_SECTIONS_V1, "critical")),
    "critical",
  ),
  // Третий вид тревоги (T099): критичный пункт, оставленный БЕЗ ОТВЕТА, а не
  // проваленный. Заполнение отправлено, но один критичный числовой пункт ушёл из
  // надзора молча — ни «нет», ни числа вне диапазона, просто пустое место в ответах.
  // Ровно этот случай отличает `criticalUnanswered` от `criticalFailed`, и без такого
  // заполнения в демо-контуре третий вид тревоги на показе не появляется никогда.
  submission(
    "d7000000-0000-4000-8000-000000000014",
    VERSION_MORNING_V2_ID,
    STATION_CENTRAL_KITCHEN_ID,
    0,
    "09:15",
    7,
    answersFor(CHECKLIST_MORNING_SECTIONS_V2, {
      note: "Extra delivery boxes this morning, took longer than usual to sort the walk-in.",
      unanswered: ["item-delivery-temperature"],
    }),
  ),
];

/**
 * Режим на сегодня у центральной пиццерии — с ограничениями. Показ открывается
 * сразу с сокращённой сменой: полная смена ничего нового не демонстрирует, а
 * щёлкать режим руками перед каждым показом — ровно то, от чего демо избавляет.
 */
const SHIFT_MODES: readonly DemoShiftMode[] = [
  {
    storeId: STORE_CENTRAL_ID,
    mode: "reduced",
    staffPresent: 2,
    staffExpected: 4,
  },
];

export const DEMO: DemoDataset = {
  country: COUNTRY,
  stores: STORES,
  stations: STATIONS,
  blocks: [FOOD_SAFETY_BLOCK],
  checklists: [CHECKLIST_MORNING, CHECKLIST_EVENING, CHECKLIST_COUNTER],
  submissions: SUBMISSIONS,
  shiftModes: SHIFT_MODES,
};
