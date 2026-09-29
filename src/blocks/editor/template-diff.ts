// Что изменилось в шаблоне и как выбранное из этого переносится в копию (D155, T336).
//
// Отличия считаются между ДВУМЯ ВЕРСИЯМИ ШАБЛОНА — той, с которой снята копия, и
// последней, — а не между копией и шаблоном. Копия — хозяйство страны (D149): в ней свои
// пункты и свои правки, и сравнение с шаблоном выдало бы их все за «шаблон обновился».
// Человеку же нужно ровно одно: что сделал методист УК с тех пор, как страна взяла шаблон.
//
// Перенос — не перезапись. Взятое отличие ложится на копию по опознавателю пункта (копия
// хранит опознаватели шаблона, `templates.ts`), невыбранное не трогается, а свои пункты
// страны остаются на своих местах. Решение по каждому отличию за человеком (user-flow §5.3).
import type { Item, LocalizedText, Section } from "@/blocks/data";

export type TemplateChangeKind = "added" | "changed" | "removed";

/** Одно отличие шаблона: пункт и секция, в которой он живёт в последней версии. */
export interface TemplateChange {
  readonly kind: TemplateChangeKind;
  readonly itemId: string;
  /** Секция последней версии; у удалённого — секция, где пункт был. */
  readonly sectionId: string;
  readonly sectionTitle: LocalizedText;
  readonly before?: Item;
  readonly after?: Item;
}

interface Located {
  readonly item: Item;
  readonly section: Section;
}

function locate(sections: readonly Section[]): Map<string, Located> {
  const found = new Map<string, Located>();
  for (const section of sections) {
    for (const item of section.items) found.set(item.id, { item, section });
  }
  return found;
}

/**
 * Запись значения без зависимости от порядка ключей. Разметка приходит из JSONB, а база
 * хранит ключи в своём порядке: сравнение по `JSON.stringify` объявило бы изменённым
 * пункт, которого никто не трогал.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .filter(([, one]) => one !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, one]) => `${JSON.stringify(key)}:${canonical(one)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Отличия версии `after` от `before`: сначала по порядку последней версии, потом удалённые. */
export function diffTemplateVersions(
  before: readonly Section[],
  after: readonly Section[],
): readonly TemplateChange[] {
  const old = locate(before);
  const fresh = locate(after);
  const changes: TemplateChange[] = [];

  for (const section of after) {
    for (const item of section.items) {
      const was = old.get(item.id);
      const place = { sectionId: section.id, sectionTitle: section.title };
      if (was === undefined) {
        changes.push({ kind: "added", itemId: item.id, ...place, after: item });
      } else if (
        was.section.id !== section.id ||
        canonical(was.item) !== canonical(item)
      ) {
        changes.push({
          kind: "changed",
          itemId: item.id,
          ...place,
          before: was.item,
          after: item,
        });
      }
    }
  }

  for (const [itemId, was] of old) {
    if (fresh.has(itemId)) continue;
    changes.push({
      kind: "removed",
      itemId,
      sectionId: was.section.id,
      sectionTitle: was.section.title,
      before: was.item,
    });
  }

  return changes;
}

function withoutItem(sections: readonly Section[], itemId: string): Section[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.filter((one) => one.id !== itemId),
  }));
}

/**
 * Куда встать пункту в секции копии: за ближайшим предшественником по шаблону, который в
 * копии есть. Нет ни одного — в начало: так пункт стоит там же, где у шаблона.
 */
function insertionIndex(
  target: Section,
  templateSection: Section | undefined,
  itemId: string,
): number {
  const order = templateSection?.items.map((one) => one.id) ?? [];
  const position = order.indexOf(itemId);
  for (let index = position - 1; index >= 0; index -= 1) {
    const at = target.items.findIndex((one) => one.id === order[index]);
    if (at !== -1) return at + 1;
  }
  return 0;
}

/** Место новой секции в копии: за секцией, которая идёт перед ней в шаблоне. */
function sectionIndex(
  sections: readonly Section[],
  after: readonly Section[],
  sectionId: string,
): number {
  const order = after.map((one) => one.id);
  const position = order.indexOf(sectionId);
  for (let index = position - 1; index >= 0; index -= 1) {
    const at = sections.findIndex((one) => one.id === order[index]);
    if (at !== -1) return at + 1;
  }
  return position === 0 ? 0 : sections.length;
}

function placeItem(
  sections: readonly Section[],
  after: readonly Section[],
  change: TemplateChange,
  item: Item,
): Section[] {
  const templateSection = after.find((one) => one.id === change.sectionId);
  const existing = sections.find((one) => one.id === change.sectionId);

  if (existing === undefined) {
    const created: Section = {
      id: change.sectionId,
      title: change.sectionTitle,
      source: templateSection?.source ?? "own",
      items: [item],
    };
    const at = sectionIndex(sections, after, change.sectionId);
    return [...sections.slice(0, at), created, ...sections.slice(at)];
  }

  // Изменённый пункт в той же секции копии заменяется на своём месте: страна могла
  // переставить пункты, и её порядок важнее порядка шаблона.
  const inPlace = existing.items.findIndex((one) => one.id === item.id);
  return sections.map((section) => {
    if (section.id !== existing.id) return section;
    if (inPlace !== -1) {
      return {
        ...section,
        items: section.items.map((one) => (one.id === item.id ? item : one)),
      };
    }
    const at = insertionIndex(section, templateSection, item.id);
    return {
      ...section,
      items: [...section.items.slice(0, at), item, ...section.items.slice(at)],
    };
  });
}

/**
 * Копия с перенесёнными отличиями. `taken` — опознаватели пунктов, которые выбрал
 * человек; опознаватель не из `changes` не делает ничего (форма — граница). Секция,
 * опустевшая от переноса, уходит: пустую секцию страна не заводила, её оставил перенос.
 */
export function applyTemplateChanges(
  copy: readonly Section[],
  after: readonly Section[],
  changes: readonly TemplateChange[],
  taken: readonly string[],
): Section[] {
  const chosen = new Set(taken);
  let sections: Section[] = copy.map((one) => ({ ...one }));
  const touched = new Set<string>();

  for (const change of changes) {
    if (!chosen.has(change.itemId)) continue;
    const home = sections.find((one) =>
      one.items.some((it) => it.id === change.itemId),
    );
    if (home !== undefined) touched.add(home.id);

    if (change.kind === "removed" || change.after === undefined) {
      sections = withoutItem(sections, change.itemId);
      continue;
    }
    const staysHome = home?.id === change.sectionId;
    const base = staysHome ? sections : withoutItem(sections, change.itemId);
    sections = placeItem(base, after, change, change.after);
  }

  return sections.filter(
    (section) => section.items.length > 0 || !touched.has(section.id),
  );
}
