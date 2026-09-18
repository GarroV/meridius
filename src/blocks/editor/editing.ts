// Правка разметки чек-листа в браузере. Функции чистые: на вход — список секций,
// на выход — новый список. Ничего не меняется на месте, поэтому состояние экрана
// обновляется одним присваиванием, а поведение проверяется без браузера.
//
// Здесь живут правила клавиатуры (принцип 5): Enter создаёт следующий пункт и говорит,
// куда ставить курсор; Alt+стрелки переставляют пункт; вставка списка кладёт пачку
// пунктов за один раз. Каждое лишнее касание мыши — это лишняя минута на чек-лист.
import type {
  Item,
  ItemColumn,
  LocalizedText,
  ScheduleSegment,
  Section,
} from "@/blocks/data";

/** Новый опознаватель. `crypto` есть и в браузере, и в Node — импорт не нужен. */
function newId(): string {
  return crypto.randomUUID();
}

/** Пустой пункт: тип «да/нет» и обычный уровень — так его заводит методист чаще всего. */
export function emptyItem(): Item {
  return { id: newId(), title: {}, type: "bool", severity: "normal" };
}

/** Пустая секция с одним пустым пунктом: курсору сразу есть куда встать. */
function emptySection(): Section {
  return { id: newId(), title: {}, source: "own", items: [emptyItem()] };
}

/**
 * Опознаватель вставленного блока библиотеки — или `null`, если секция своя.
 *
 * Заменил прежний `isLinked`: тот отвечал «да/нет» и тип не сужал, поэтому разметке,
 * которой нужен адрес блока, пришлось бы разбирать `source` второй раз, своими руками
 * (T115). Одного ответа хватает обоим вопросам — «связана ли секция» это `!== null`.
 */
export function linkedBlockId(section: Section): string | null {
  return typeof section.source === "string" ? null : section.source.blockId;
}

export function itemCount(sections: readonly Section[]): number {
  return sections.reduce((total, section) => total + section.items.length, 0);
}

/** Есть ли у пункта текст хоть на одном языке: пустые строки не сохраняются. */
function hasText(text: LocalizedText): boolean {
  return Object.values(text).some((value) => value.trim() !== "");
}

function mapSection(
  sections: readonly Section[],
  sectionId: string,
  change: (section: Section) => Section,
): Section[] {
  return sections.map((section) =>
    section.id === sectionId ? change(section) : section,
  );
}

function mapItems(
  sections: readonly Section[],
  change: (items: readonly Item[]) => Item[],
): Section[] {
  return sections.map((section) => ({
    ...section,
    items: change(section.items),
  }));
}

/**
 * Enter в поле пункта: следующий пункт встаёт сразу за текущим, а не в конце списка,
 * и возвращённый `focusItemId` говорит экрану, куда перевести курсор.
 */
export function addItemAfter(
  sections: readonly Section[],
  sectionId: string,
  afterItemId: string | null,
): { sections: Section[]; focusItemId: string } {
  const created = emptyItem();

  return {
    sections: mapSection(sections, sectionId, (section) => {
      const at = section.items.findIndex((item) => item.id === afterItemId);
      const items = [...section.items];
      items.splice(at < 0 ? items.length : at + 1, 0, created);
      return { ...section, items };
    }),
    focusItemId: created.id,
  };
}

/**
 * Alt+↑/↓: пункт переставляется внутри своей секции. На границе секции ничего не
 * происходит — пункт, уехавший в соседнюю секцию, для методиста просто исчезает.
 */
export function moveItem(
  sections: readonly Section[],
  itemId: string,
  delta: -1 | 1,
): { sections: Section[]; moved: boolean } {
  const unchanged = { sections: [...sections], moved: false };

  const sectionAt = sections.findIndex((section) =>
    section.items.some((item) => item.id === itemId),
  );
  const section = sections[sectionAt];
  if (section === undefined) return unchanged;

  const from = section.items.findIndex((item) => item.id === itemId);
  const to = from + delta;
  const current = section.items[from];
  // Соседа нет — пункт на границе секции: он остаётся на месте. Пункт, уехавший
  // в соседнюю секцию от одного нажатия, для методиста просто исчезает.
  const neighbour = section.items[to];
  if (current === undefined || neighbour === undefined) return unchanged;

  // Перестановка на одну позицию — это обмен соседями.
  const items = [...section.items];
  items[from] = neighbour;
  items[to] = current;

  return {
    sections: sections.map((one, index) =>
      index === sectionAt ? { ...section, items } : one,
    ),
    moved: true,
  };
}

/**
 * Вставка списка из буфера. Пустой пункт, в который вставляли, занимается первой
 * строкой списка: иначе после вставки в чек-листе остаётся пустая строка на ровном месте.
 */
export function insertItems(
  sections: readonly Section[],
  sectionId: string,
  atItemId: string | null,
  items: readonly Item[],
): Section[] {
  if (items.length === 0) return [...sections];

  return mapSection(sections, sectionId, (section) => {
    const at = section.items.findIndex((item) => item.id === atItemId);
    const anchor = at < 0 ? undefined : section.items[at];
    const replaceAnchor = anchor !== undefined && !hasText(anchor.title);

    const next = [...section.items];
    if (replaceAnchor) {
      next.splice(at, 1, ...items);
    } else {
      next.splice(at < 0 ? next.length : at + 1, 0, ...items);
    }
    return { ...section, items: next };
  });
}

/** Пустая колонка табличного пункта: название методист впишет сразу после нажатия. */
function emptyColumn(): ItemColumn {
  return { id: newId(), title: {} };
}

/**
 * Колонки по типу пункта. У таблицы первая колонка заводится вместе с типом — иначе
 * методист получает пункт, в котором нечего заполнять, и не видит, чем это лечить.
 * У остальных родов колонки снимаются по той же причине, что и границы диапазона:
 * невидимое на экране поле, уехав в JSONB, останется там навсегда.
 */
function withColumnsByType(item: Item): Item {
  if (item.type === "table") {
    return item.columns === undefined
      ? { ...item, columns: [emptyColumn()] }
      : item;
  }
  const { columns, ...withoutColumns } = item;
  void columns;
  return withoutColumns;
}

/** Правка полей пункта. Смена типа на «да/нет» и «текст» снимает границы диапазона. */
export function updateItem(
  sections: readonly Section[],
  itemId: string,
  patch: Partial<Item>,
): Section[] {
  return mapItems(sections, (items) =>
    items.map((item) => {
      if (item.id !== itemId) return item;
      const merged = withColumnsByType({ ...item, ...patch });
      if (merged.type === "number") return merged;
      // Границы и единица измерения у нечислового пункта не видны на экране и не
      // правятся: оставить их значит увезти в базу невидимое значение (D110 — то же
      // рассуждение, что у границ). Убираем ровно их, а не собираем пункт заново из
      // списка полей: перечисление молча теряло всё, что появилось у пункта позже, —
      // так смена типа ответа стирала расписание обхода (T137).
      const { min, max, unit, ...withoutBounds } = merged;
      void min;
      void max;
      void unit;
      return withoutBounds;
    }),
  );
}

/** Правка колонок одного табличного пункта: остальные пункты остаются теми же. */
function mapColumns(
  sections: readonly Section[],
  itemId: string,
  change: (columns: readonly ItemColumn[]) => ItemColumn[],
): Section[] {
  return mapItems(sections, (items) =>
    items.map((item) =>
      item.id === itemId
        ? { ...item, columns: change(item.columns ?? []) }
        : item,
    ),
  );
}

/**
 * «Добавить колонку»: новая встаёт в конец, и её опознаватель возвращается наружу —
 * тем же приёмом, что `addItemAfter`, чтобы экран перевёл курсор в новое поле, а не
 * заставлял методиста искать его мышью.
 */
export function addColumn(
  sections: readonly Section[],
  itemId: string,
): { sections: Section[]; focusColumnId: string } {
  const created = emptyColumn();
  return {
    sections: mapColumns(sections, itemId, (columns) => [...columns, created]),
    focusColumnId: created.id,
  };
}

/** Название колонки на языке интерфейса; названия на других языках остаются как были. */
export function setColumnTitle(
  sections: readonly Section[],
  itemId: string,
  columnId: string,
  locale: string,
  text: string,
): Section[] {
  return mapColumns(sections, itemId, (columns) =>
    columns.map((column) =>
      column.id === columnId
        ? { ...column, title: { ...column.title, [locale]: text } }
        : column,
    ),
  );
}

/**
 * Норма над колонкой — отдельное поле, а не часть названия: в бумажном журнале она
 * стоит своей строкой над шапкой, и на экране сотрудника ей тоже своё место.
 */
export function setColumnNorm(
  sections: readonly Section[],
  itemId: string,
  columnId: string,
  locale: string,
  text: string,
): Section[] {
  return mapColumns(sections, itemId, (columns) =>
    columns.map((column) =>
      column.id === columnId
        ? { ...column, norm: { ...(column.norm ?? {}), [locale]: text } }
        : column,
    ),
  );
}

/** Удаление колонки. Последняя удаляется тоже: пустой список честнее мёртвой колонки. */
export function removeColumn(
  sections: readonly Section[],
  itemId: string,
  columnId: string,
): Section[] {
  return mapColumns(sections, itemId, (columns) =>
    columns.filter((column) => column.id !== columnId),
  );
}

/**
 * Настройка регулярности, как её отдаёт окно чипа. Пустой список отрезков означает
 * «пункт обычный»: `schedule` и частота снимаются оба.
 */
export interface ScheduleSetting {
  readonly schedule: readonly ScheduleSegment[];
  readonly remindEveryMinutes?: number;
}

/**
 * Пункт с применённой настройкой.
 *
 * Оба поля СНИМАЮТСЯ, а не переписываются пустым значением: `isPeriodic` считает пункт
 * обычным и по отсутствию поля, и по пустому списку, и два способа записать одно
 * состояние расходятся молча. Частота без расписания не остаётся никогда — звонить
 * было бы нечему, а поле следующий читатель примет за работающее.
 */
function withSchedule(item: Item, setting: ScheduleSetting): Item {
  const { schedule, remindEveryMinutes, ...rest } = item;
  void schedule;
  void remindEveryMinutes;
  if (setting.schedule.length === 0) return rest;
  return {
    ...rest,
    schedule: [...setting.schedule],
    ...(setting.remindEveryMinutes === undefined
      ? {}
      : { remindEveryMinutes: setting.remindEveryMinutes }),
  };
}

/** Регулярность одного пункта: чип в его строке открыл окно и оно вернуло настройку. */
export function setItemSchedule(
  sections: readonly Section[],
  itemId: string,
  setting: ScheduleSetting,
): Section[] {
  return mapItems(sections, (items) =>
    items.map((item) =>
      item.id === itemId ? withSchedule(item, setting) : item,
    ),
  );
}

/**
 * «Применить ко всей секции» — кнопка того же окна.
 *
 * Секция носителем расписания НЕ становится (D075): это перенос настройки на семь
 * строк, то есть работа редактора, а не новая сущность модели. Поэтому здесь и нет
 * никакой записи у самой секции — только у её пунктов.
 */
export function applyScheduleToSection(
  sections: readonly Section[],
  sectionId: string,
  setting: ScheduleSetting,
): Section[] {
  return mapSection(sections, sectionId, (section) => ({
    ...section,
    items: section.items.map((item) => withSchedule(item, setting)),
  }));
}

/** Текст пункта на языке интерфейса; тексты на других языках остаются как были. */
export function setItemTitle(
  sections: readonly Section[],
  itemId: string,
  locale: string,
  text: string,
): Section[] {
  return mapItems(sections, (items) =>
    items.map((item) =>
      item.id === itemId
        ? { ...item, title: { ...item.title, [locale]: text } }
        : item,
    ),
  );
}

export function removeItem(
  sections: readonly Section[],
  itemId: string,
): Section[] {
  return mapItems(sections, (items) =>
    items.filter((item) => item.id !== itemId),
  );
}

export function addSection(sections: readonly Section[]): {
  sections: Section[];
  sectionId: string;
} {
  const created = emptySection();
  return { sections: [...sections, created], sectionId: created.id };
}

export function setSectionTitle(
  sections: readonly Section[],
  sectionId: string,
  locale: string,
  text: string,
): Section[] {
  return mapSection(sections, sectionId, (section) => ({
    ...section,
    title: { ...section.title, [locale]: text },
  }));
}

export function removeSection(
  sections: readonly Section[],
  sectionId: string,
): Section[] {
  return sections.filter((section) => section.id !== sectionId);
}

/** Блок библиотеки для вставки: сам блок живёт в своём разделе, здесь только ссылка. */
export interface InsertableBlock {
  id: string;
  title: LocalizedText;
  items: readonly Item[];
}

/**
 * Вставка блока библиотеки: секция хранит ссылку `{ blockId }`, а пункты показываются
 * блоковые. Правка блока придёт сюда сама; в опубликованную версию уедет снимок (D002).
 */
export function insertLibrarySection(
  sections: readonly Section[],
  block: InsertableBlock,
): Section[] {
  return [
    ...sections,
    {
      id: newId(),
      title: { ...block.title },
      source: { blockId: block.id },
      items: block.items.map((item) => ({ ...item })),
    },
  ];
}

/**
 * «Отвязать»: секция перестаёт зависеть от блока и становится своей. Пункты остаются,
 * но получают новые опознаватели — иначе два чек-листа делили бы один пункт.
 */
export function unlinkSection(
  sections: readonly Section[],
  sectionId: string,
): Section[] {
  return mapSection(sections, sectionId, (section) => ({
    ...section,
    source: "own",
    items: section.items.map((item) => ({ ...item, id: newId() })),
  }));
}
