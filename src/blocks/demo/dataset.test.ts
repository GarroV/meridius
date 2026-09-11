// Требования к содержимому демонстрационного контура. Тесты написаны до самих данных:
// они и есть контракт на состав (T049) и одновременно защита от тихой порчи —
// русская строка, дубль опознавателя или код станции не из алфавита наклейки
// ломают демо не в момент правки, а на показе.
import { describe, expect, test } from "vitest";

import { STATION_CODE_ALPHABET, STATION_CODE_LENGTH } from "@/blocks/catalog";
import type { Answer, Item, LocalizedText, Section } from "@/blocks/data";
import {
  countFailedCritical,
  countUnansweredCritical,
  flattenItems,
  sectionsForMode,
  severityOf,
} from "@/blocks/data";

import { DEMO } from "./dataset";
import type { DemoChecklist, DemoVersion } from "./model";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CYRILLIC = /[Ѐ-ӿ]/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const EXPECTED_STORES = 2;
const EXPECTED_STATIONS = 5;
const EXPECTED_CHECKLISTS = 3;
const MIN_SUBMISSIONS = 10;
const MIN_SECTIONS_PER_CHECKLIST = 2;
const MIN_REUSE_CHECKLISTS = 2;

/**
 * Заполнение T099: единственное в контуре, которое сознательно оставляет один
 * критичный пункт БЕЗ ОТВЕТА — так на показе появляется третий вид тревоги
 * (`criticalUnanswered`), отдельный от провала. Инвариант «ответы покрывают ровно
 * то, что спросили» ниже намеренно на него не распространяется: непроверенный
 * останов и есть его единственное назначение, а не недосмотр авторов данных.
 */
const UNANSWERED_CRITICAL_SUBMISSION_ID =
  "d7000000-0000-4000-8000-000000000014";
const UNANSWERED_CRITICAL_ITEM_ID = "item-delivery-temperature";

function publishedVersion(checklist: DemoChecklist): DemoVersion {
  const found = checklist.versions.find(
    (version) => version.status === "published",
  );
  if (found === undefined) {
    throw new Error(`У чек-листа ${checklist.id} нет опубликованной версии`);
  }
  return found;
}

function allVersions(): DemoVersion[] {
  return DEMO.checklists.flatMap((checklist) => [...checklist.versions]);
}

function allSections(): Section[] {
  return [
    ...DEMO.checklists.flatMap((checklist) => [
      ...checklist.draft.sections,
      ...checklist.versions.flatMap((version) => [...version.sections]),
    ]),
  ];
}

function allItems(): Item[] {
  return [
    ...flattenItems(allSections()),
    ...DEMO.blocks.flatMap((block) => [...block.items]),
  ];
}

/** Все человекочитаемые строки контура: имена справочника и тексты чек-листов. */
function allTexts(): string[] {
  const localized: LocalizedText[] = [
    ...allSections().map((section) => section.title),
    ...allItems().map((item) => item.title),
    ...allItems().flatMap((item) =>
      item.hint === undefined ? [] : [item.hint],
    ),
    ...DEMO.blocks.map((block) => block.title),
    ...DEMO.checklists.map((checklist) => checklist.title),
  ];
  return [
    DEMO.country.name,
    ...DEMO.stores.map((store) => store.name),
    ...DEMO.stations.map((station) => station.name),
    ...localized.flatMap((text) => Object.values(text)),
    ...DEMO.submissions.flatMap((submission) =>
      submission.answers.flatMap((answer) => [
        answer.comment ?? "",
        typeof answer.value === "string" ? answer.value : "",
      ]),
    ),
  ];
}

/** Все опознаватели строк базы: они и есть область, которую сид у себя чистит. */
function allRowIds(): string[] {
  return [
    DEMO.country.id,
    ...DEMO.stores.map((store) => store.id),
    ...DEMO.stations.map((station) => station.id),
    ...DEMO.blocks.map((block) => block.id),
    ...DEMO.checklists.map((checklist) => checklist.id),
    ...DEMO.checklists.map((checklist) => checklist.draft.id),
    ...allVersions().map((version) => version.id),
    ...DEMO.submissions.map((submission) => submission.id),
  ];
}

function withAnswerTime(answers: readonly Omit<Answer, "at">[]): Answer[] {
  return answers.map((answer) => ({ ...answer, at: 0 }));
}

describe("состав демонстрационного контура", () => {
  test("страна одна, отдельная и английская", () => {
    expect(DEMO.country.locale).toBe("en");
    expect(DEMO.country.name).not.toBe("");
  });

  test("две пиццерии и пять станций, каждая станция в своей пиццерии", () => {
    expect(DEMO.stores).toHaveLength(EXPECTED_STORES);
    expect(DEMO.stations).toHaveLength(EXPECTED_STATIONS);

    const storeIds = new Set(DEMO.stores.map((store) => store.id));
    for (const station of DEMO.stations) {
      expect(storeIds.has(station.storeId)).toBe(true);
    }
    // Обе пиццерии со станциями: пустая пиццерия в демо смотрится недоделкой.
    for (const store of DEMO.stores) {
      expect(
        DEMO.stations.some((station) => station.storeId === store.id),
      ).toBe(true);
    }
  });

  test("часовой пояс пиццерии настоящий: по нему окно сравнивается с местным временем", () => {
    for (const store of DEMO.stores) {
      expect(() =>
        new Intl.DateTimeFormat("en", { timeZone: store.timezone }).format(),
      ).not.toThrow();
    }
  });

  test("коды станций — из алфавита наклейки, нужной длины и неповторяющиеся", () => {
    for (const station of DEMO.stations) {
      expect(station.code).toHaveLength(STATION_CODE_LENGTH);
      for (const symbol of station.code) {
        expect(STATION_CODE_ALPHABET).toContain(symbol);
      }
    }
    const codes = DEMO.stations.map((station) => station.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("три чек-листа, у каждого черновик, одна опубликованная версия и не меньше двух секций", () => {
    expect(DEMO.checklists).toHaveLength(EXPECTED_CHECKLISTS);

    const stationIds = new Set(DEMO.stations.map((station) => station.id));
    for (const checklist of DEMO.checklists) {
      expect(stationIds.has(checklist.stationId)).toBe(true);
      expect(
        checklist.versions.filter((version) => version.status === "published"),
      ).toHaveLength(1);
      expect(checklist.draft.sections.length).toBeGreaterThanOrEqual(
        MIN_SECTIONS_PER_CHECKLIST,
      );
      expect(
        publishedVersion(checklist).sections.length,
      ).toBeGreaterThanOrEqual(MIN_SECTIONS_PER_CHECKLIST);
      expect(TIME_PATTERN.test(checklist.window.start)).toBe(true);
      expect(TIME_PATTERN.test(checklist.window.end)).toBe(true);
      // Равные границы запрещены проверкой базы `checklists_window_not_empty`.
      expect(checklist.window.start).not.toBe(checklist.window.end);
    }
  });

  test("номера версий одного чек-листа не повторяются, а архивная старше опубликованной", () => {
    for (const checklist of DEMO.checklists) {
      const numbers = checklist.versions.map(
        (version) => version.versionNumber,
      );
      expect(new Set(numbers).size).toBe(numbers.length);

      const published = publishedVersion(checklist);
      for (const version of checklist.versions) {
        if (version.status !== "archived") continue;
        expect(version.versionNumber).toBeLessThan(published.versionNumber);
        expect(version.publishedHoursAgo).toBeGreaterThan(
          published.publishedHoursAgo,
        );
      }
    }
  });

  test("демо показывает все три уровня пунктов", () => {
    // Демо существует, чтобы показывать продукт. Уровень, которого в нём нет,
    // на показе не существует вовсе (D056).
    const levels = new Set(allItems().map((item) => severityOf(item)));

    expect([...levels].sort()).toStrictEqual(["critical", "major", "normal"]);
  });

  test("в критичную смену остаётся непустым хотя бы один чек-лист", () => {
    // Иначе показ сокращённой смены упирался бы в «заполнять нечего» на каждой
    // станции, и главную мысль градации показать было бы нечем.
    const nonEmpty = DEMO.checklists.filter(
      (checklist) =>
        sectionsForMode(publishedVersion(checklist).sections, "critical")
          .length > 0,
    );

    expect(nonEmpty.length).toBeGreaterThan(0);
  });

  test("блок библиотеки заведён один раз и вставлен не меньше чем в два чек-листа", () => {
    expect(DEMO.blocks.length).toBeGreaterThan(0);

    for (const block of DEMO.blocks) {
      const usedIn = DEMO.checklists.filter((checklist) =>
        checklist.draft.sections.some(
          (section) =>
            typeof section.source !== "string" &&
            section.source.blockId === block.id,
        ),
      );
      expect(usedIn.length).toBeGreaterThanOrEqual(MIN_REUSE_CHECKLISTS);

      // В опубликованной версии от блока остаётся снимок его пунктов: правка блока
      // не имеет права менять уже опубликованное (D011, принцип 3).
      for (const checklist of usedIn) {
        const linked = publishedVersion(checklist).sections.find(
          (section) =>
            typeof section.source !== "string" &&
            section.source.blockId === block.id,
        );
        expect(linked).toBeDefined();
        expect(linked?.items.map((item) => item.id)).toStrictEqual(
          block.items.map((item) => item.id),
        );
      }
    }
  });

  test("хотя бы у одной станции чек-листы закрывают все сутки: демо открывается в любой час", () => {
    const covered = DEMO.stations.some((station) => {
      const windows = DEMO.checklists
        .filter((checklist) => checklist.stationId === station.id)
        .map((checklist) => checklist.window);
      const minutes = new Set<number>();
      for (const window of windows) {
        const start = toMinutes(window.start);
        const end = toMinutes(window.end);
        const length = start < end ? end - start : 24 * 60 - start + end;
        for (let offset = 0; offset < length; offset++) {
          minutes.add((start + offset) % (24 * 60));
        }
      }
      return minutes.size === 24 * 60;
    });
    expect(covered).toBe(true);
  });

  test("заполнений не меньше десятка, все ссылаются на опубликованные и архивные версии своей станции", () => {
    expect(DEMO.submissions.length).toBeGreaterThanOrEqual(MIN_SUBMISSIONS);

    const versionStation = new Map(
      DEMO.checklists.flatMap((checklist) =>
        checklist.versions.map(
          (version) => [version.id, checklist.stationId] as const,
        ),
      ),
    );
    for (const submission of DEMO.submissions) {
      expect(versionStation.get(submission.versionId)).toBe(
        submission.stationId,
      );
      expect(submission.durationMinutes).toBeGreaterThan(0);
      expect(submission.daysAgo).toBeGreaterThanOrEqual(0);
      expect(submission.at).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/u);
    }
  });

  test("ответы покрывают ровно те пункты, которых ждал режим смены", () => {
    const sectionsByVersion = new Map(
      allVersions().map((version) => [version.id, [...version.sections]]),
    );
    for (const submission of DEMO.submissions) {
      const sections = sectionsByVersion.get(submission.versionId) ?? [];
      // Ждали не всю версию, а её часть по режиму (D056): в критичную смену
      // остальные пункты сотруднику не показывали вовсе.
      const asked = flattenItems(
        sectionsForMode(sections, submission.mode ?? "normal"),
      ).map((item) => item.id);
      const answered = submission.answers.map((answer) => answer.itemId);

      expect(new Set(answered).size).toBe(answered.length);

      if (submission.id === UNANSWERED_CRITICAL_SUBMISSION_ID) {
        // Единственное официальное исключение (T099, см. константу выше): один
        // критичный пункт нарочно остаётся без ответа, чтобы поднять тревогу
        // `criticalUnanswered`. Остальные пункты по-прежнему отвечены полностью.
        const expectedAnswered = asked.filter(
          (id) => id !== UNANSWERED_CRITICAL_ITEM_ID,
        );
        expect([...answered].sort()).toStrictEqual(
          [...expectedAnswered].sort(),
        );
        continue;
      }

      // Недозаполненных пунктов в демо нет: лента показывала бы «отвечено 3 из 7»,
      // и это читалось бы как недоделка продукта, а не как замысел данных.
      expect([...answered].sort()).toStrictEqual([...asked].sort());
    }
  });

  test("ровно одно заполнение проваливает критичный пункт и объясняет это комментарием", () => {
    const sectionsByVersion = new Map(
      allVersions().map((version) => [version.id, [...version.sections]]),
    );

    const failing = DEMO.submissions.filter(
      (submission) =>
        countFailedCritical(
          sectionsByVersion.get(submission.versionId) ?? [],
          withAnswerTime(submission.answers),
        ) > 0,
    );
    expect(failing).toHaveLength(1);

    const [submission] = failing;
    const critical = new Set(
      flattenItems(sectionsByVersion.get(submission?.versionId ?? "") ?? [])
        .filter((item) => severityOf(item) === "critical")
        .map((item) => item.id),
    );
    const failed = submission?.answers.filter(
      (answer) => critical.has(answer.itemId) && answer.value === false,
    );
    expect(failed?.length).toBe(1);
    expect((failed?.[0]?.comment ?? "").length).toBeGreaterThan(0);
  });

  test("ровно одно заполнение оставляет критичный пункт без ответа, и оно за сегодня", () => {
    // Требование к ДАННЫМ, а не к продукту: тревога «критичный пункт без ответа»
    // (`criticalUnanswered` в блоке feed) считается только по заполнениям за ТЕКУЩИЕ
    // местные сутки пиццерии. Заведи это заполнение вчерашним числом или не заведи
    // вовсе — и третий вид тревоги на показе не появится никогда, при том что
    // продуктовый код тревоги всё это время работает правильно.
    const sectionsByVersion = new Map(
      allVersions().map((version) => [version.id, [...version.sections]]),
    );

    const withUnanswered = DEMO.submissions.filter(
      (submission) =>
        countUnansweredCritical(
          sectionsByVersion.get(submission.versionId) ?? [],
          withAnswerTime(submission.answers),
        ) > 0,
    );

    expect(withUnanswered).toHaveLength(1);
    expect(withUnanswered[0]?.daysAgo).toBe(0);
    // Это ровно то заполнение, которому проверка покрытия выше делает исключение, и
    // без ответа в нём остался ровно тот пункт. Без двух строк ниже требования могли бы
    // разъехаться молча: исключение осталось бы на одном заполнении, а тревогу поднимало
    // бы другое — и «ровно одно» перестало бы значить «то самое одно».
    expect(withUnanswered[0]?.id).toBe(UNANSWERED_CRITICAL_SUBMISSION_ID);
    expect(
      withUnanswered[0]?.answers.some(
        (answer) => answer.itemId === UNANSWERED_CRITICAL_ITEM_ID,
      ),
    ).toBe(false);
  });

  test("числовые пункты заданы диапазоном, а ответы на них — числа", () => {
    const items = new Map(allItems().map((item) => [item.id, item]));
    for (const item of items.values()) {
      if (item.type !== "number") continue;
      expect(item.min).toBeDefined();
      expect(item.max).toBeDefined();
      expect(item.min ?? 0).toBeLessThan(item.max ?? 0);
    }
    for (const submission of DEMO.submissions) {
      for (const answer of submission.answers) {
        const item = items.get(answer.itemId);
        if (item === undefined) continue;
        if (item.type === "number") expect(typeof answer.value).toBe("number");
        if (item.type === "bool") expect(typeof answer.value).toBe("boolean");
        if (item.type === "text") expect(typeof answer.value).toBe("string");
      }
    }
  });

  test("опознаватели строк — настоящие uuid и ни один не повторяется", () => {
    const ids = allRowIds();
    for (const id of ids) expect(UUID_PATTERN.test(id)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("опознаватели секций и пунктов внутри одной разметки не повторяются", () => {
    for (const sections of [
      ...DEMO.checklists.map((checklist) => [...checklist.draft.sections]),
      ...allVersions().map((version) => [...version.sections]),
    ]) {
      const sectionIds = sections.map((section) => section.id);
      expect(new Set(sectionIds).size).toBe(sectionIds.length);
      const itemIds = flattenItems(sections).map((item) => item.id);
      expect(new Set(itemIds).size).toBe(itemIds.length);
    }
  });

  test("демо говорит только по-английски: русских букв нет нигде", () => {
    for (const text of allTexts()) {
      expect(CYRILLIC.test(text)).toBe(false);
    }
  });

  test("все многоязычные тексты заведены на английском и непусты", () => {
    const localized: LocalizedText[] = [
      ...allSections().map((section) => section.title),
      ...allItems().map((item) => item.title),
      ...DEMO.blocks.map((block) => block.title),
      ...DEMO.checklists.map((checklist) => checklist.title),
    ];
    for (const text of localized) {
      expect(Object.keys(text)).toStrictEqual(["en"]);
      expect((text["en"] ?? "").trim()).not.toBe("");
    }
  });
});

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

// ---------- Время заполнений: демо не должно спорить само с собой ----------

const MINUTES_PER_HOUR = 60;

/** "23:30" → 1410. Формат уже проверен выше, здесь достаточно разбора. */
function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * MINUTES_PER_HOUR + (minutes ?? 0);
}

interface Windowed {
  readonly checklistId: string;
  readonly start: number;
  readonly end: number;
  /** Окно через полночь: 17:00–05:00. */
  readonly crossesMidnight: boolean;
}

/** Окно чек-листа, к которому относится версия заполнения. */
function windowByVersion(): Map<string, Windowed> {
  const byVersion = new Map<string, Windowed>();
  for (const checklist of DEMO.checklists) {
    const start = minutesOf(checklist.window.start);
    const end = minutesOf(checklist.window.end);
    for (const version of checklist.versions) {
      byVersion.set(version.id, {
        checklistId: checklist.id,
        start,
        end,
        crossesMidnight: start > end,
      });
    }
  }
  return byVersion;
}

/**
 * В каких местных сутках НАЧАЛСЯ проход окна, который закрыло это заполнение.
 * У окна через полночь заполнение после полуночи относится к проходу, начатому
 * в предыдущие сутки.
 */
function occurrenceStartDaysAgo(
  daysAgo: number,
  at: number,
  window: Windowed,
): number {
  return window.crossesMidnight && at < window.end ? daysAgo + 1 : daysAgo;
}

describe("время заполнений демо", () => {
  test("каждое заполнение попадает внутрь окна своего чек-листа", () => {
    // Иначе демо противоречит само себе: лента показывает вечерний чек-лист
    // выполненным в полдень, а тревога — пропущенным. Оба утверждения верны,
    // и вместе они читаются как дефект продукта ровно на показе.
    const windows = windowByVersion();

    for (const submission of DEMO.submissions) {
      const window = windows.get(submission.versionId);
      if (window === undefined) throw new Error("версия без чек-листа");
      const at = minutesOf(submission.at);

      const inside = window.crossesMidnight
        ? at >= window.start || at < window.end
        : at >= window.start && at < window.end;
      expect(inside).toBe(true);
    }
  });

  test("чек-лист с окном внутри суток заполнен сегодня: ложной тревоги не будет", () => {
    // Окно 05:00–17:00 закрывается вечером того же дня. Если заполнения за сегодня
    // нет, показ после 17:00 открывался бы тревогой о пропуске — про чек-лист,
    // который в демо считается сделанным.
    const windows = windowByVersion();
    const filledToday = new Set<string>();

    for (const submission of DEMO.submissions) {
      const window = windows.get(submission.versionId);
      if (window === undefined) continue;
      const startDay = occurrenceStartDaysAgo(
        submission.daysAgo,
        minutesOf(submission.at),
        window,
      );
      if (startDay === 0) filledToday.add(window.checklistId);
    }

    for (const checklist of DEMO.checklists) {
      if (minutesOf(checklist.window.start) > minutesOf(checklist.window.end)) {
        continue;
      }
      expect(filledToday).toContain(checklist.id);
    }
  });

  test("вечернее закрытие за прошедшую ночь намеренно НЕ заполнено", () => {
    // Это и есть тревога, которую демо показывает: смена ушла, не закрыв кухню.
    // Заполни этот проход — и второй вид тревоги на показе исчезнет.
    const windows = windowByVersion();

    for (const submission of DEMO.submissions) {
      const window = windows.get(submission.versionId);
      if (!window?.crossesMidnight) continue;

      const startDay = occurrenceStartDaysAgo(
        submission.daysAgo,
        minutesOf(submission.at),
        window,
      );
      // Проход, закончившийся сегодня в 05:00, начался вчера — его и оставляем пустым.
      expect(startDay).not.toBe(1);
    }
  });
});
