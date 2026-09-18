// Чистая сборка модели экрана заполнения из данных чек-листа. Никакого next-intl
// и next/navigation здесь: их приносит только серверный компонент, а сама сборка
// проверяется модульными тестами без базы и без React.
import type { Locale } from "@/blocks/core/locale";
import { isPeriodic, severityOf } from "@/blocks/data";
import type { Item, LocalizedText, Section } from "@/blocks/data";

import { pickFillText } from "./locale";
import type {
  FillChoiceOption,
  FillChoiceView,
  FillColumnView,
  FillItemView,
  FillScreenView,
  FillSectionView,
  FillViewLabels,
} from "./model";

export interface BuildFillViewInput {
  readonly sections: readonly Section[];
  readonly checklistTitle: LocalizedText;
  readonly storeName: string;
  readonly stationName: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly locales: readonly Locale[];
  readonly labels: FillViewLabels;
}

// Длина строки "HH:MM" — до неё обрезается время из базы ("06:00:00" → "06:00").
const TIME_PREFIX_LENGTH = 5;
// Разделитель окна времени — тире (U+2013), а не дефис: так в эталоне экрана.
const WINDOW_SEPARATOR = "–";
// Разделитель частей шапки («Пиццерия · Станция · окно») и кусков подсказки пункта —
// один и тот же символ, поэтому константа общая для обоих мест склейки.
const TEXT_PART_SEPARATOR = " · ";

/**
 * Время из базы обрезается до "HH:MM" и не разбирается: строка неожиданного вида
 * (пустая, короче обычного, мусор) возвращается как есть после этой обрезки —
 * придумывать за методиста, что он имел в виду, не наше дело.
 */
function truncateToMinutes(time: string): string {
  return time.slice(0, TIME_PREFIX_LENGTH);
}

/**
 * "06:00–12:00". Окно через полночь (конец раньше начала) — обычный случай:
 * порядок границ здесь не проверяется, это забота другого места.
 */
export function formatWindow(windowStart: string, windowEnd: string): string {
  return `${truncateToMinutes(windowStart)}${WINDOW_SEPARATOR}${truncateToMinutes(windowEnd)}`;
}

/** Непустые части через разделитель — пустая часть не оставляет лишнего разделителя. */
function joinNonEmpty(parts: readonly string[], separator: string): string {
  return parts.filter((part) => part !== "").join(separator);
}

/**
 * Пункт без названия ни на одном языке — черновик, который методист ещё не заполнил
 * (то же решение, что в `validation.ts#parseItem`). Показывать его сотруднику нельзя.
 */
function hasTitle(text: LocalizedText): boolean {
  return Object.keys(text).length > 0;
}

/** Подпись диапазона числового пункта: обе границы, только одна, либо её нет вовсе. */
function rangeHint(item: Item, labels: FillViewLabels): string {
  if (item.type !== "number") return "";
  if (item.min !== undefined && item.max !== undefined) {
    return labels.range(item.min, item.max);
  }
  if (item.min !== undefined) return labels.rangeFrom(item.min);
  if (item.max !== undefined) return labels.rangeTo(item.max);
  return "";
}

/**
 * Единица измерения числового пункта на языке цепочки; `null` — единицы нет.
 * Пустая строка тоже читается как «нет»: разделитель перед пустотой — это дырка
 * на экране, а не сведения (D110).
 *
 * У нечислового пункта единицы не бывает, даже если поле в данных заполнено: без
 * числа она ничего не измеряет, а на экране заняла бы место рядом с «да/нет».
 */
function unitLabel(item: Item, locales: readonly Locale[]): string | null {
  if (item.type !== "number" || item.unit === undefined) return null;
  const text = pickFillText(item.unit, locales);
  return text === "" ? null : text;
}

/**
 * Подсказка методиста под названием пункта; `null` — её нет (пустой строкой
 * разметка отрисовала бы пустой блок подсказки).
 *
 * Границы числового пункта сюда БОЛЬШЕ не подмешиваются: они уехали к самому полю
 * (`range`), туда, где в них есть нужда — в минуту набора значения. Показывать их и
 * там и тут значило бы назвать один факт дважды на одном экране.
 */
function buildHint(item: Item, locales: readonly Locale[]): string | null {
  const ownHint =
    item.hint === undefined ? "" : pickFillText(item.hint, locales);
  return ownHint === "" ? null : ownHint;
}

/**
 * Колонки журнала на языке цепочки. Пустой список у табличного пункта — не ошибка
 * экрана: методист опубликовал пункт, не заведя ни одной колонки, и сотруднику
 * честнее увидеть журнал без полей, чем не увидеть пункта вовсе.
 */
function buildColumnViews(
  item: Item,
  locales: readonly Locale[],
): FillColumnView[] {
  return (item.columns ?? []).map((column) => {
    const norm =
      column.norm === undefined ? "" : pickFillText(column.norm, locales);
    return {
      id: column.id,
      title: pickFillText(column.title, locales),
      norm: norm === "" ? null : norm,
    };
  });
}

function buildItemView(
  item: Item,
  locales: readonly Locale[],
  labels: FillViewLabels,
): FillItemView {
  return {
    id: item.id,
    title: pickFillText(item.title, locales),
    type: item.type,
    severity: severityOf(item),
    // exactOptionalPropertyTypes требует не выставлять ключ, а не выставлять его в undefined.
    ...(item.min === undefined ? {} : { min: item.min }),
    ...(item.max === undefined ? {} : { max: item.max }),
    hint: buildHint(item, locales),
    range: rangeHint(item, labels) || null,
    unit: unitLabel(item, locales),
    ...(item.type === "table"
      ? { columns: buildColumnViews(item, locales) }
      : {}),
  };
}

/**
 * Секция с пунктами, у которых есть название (то же правило, что в
 * `editor/ui/PreviewScreen.tsx#visibleSections`). Секция, где после этой чистки
 * не осталось ни одного пункта, выпадает целиком — заголовок без единой строки
 * под ним сотруднику ничего не говорит.
 */
function buildSectionView(
  section: Section,
  locales: readonly Locale[],
  labels: FillViewLabels,
): FillSectionView | null {
  const items = section.items
    // Периодические пункты в форму не идут: их отмечают обходом по расписанию, а не
    // отправкой чек-листа (D076). Попади они сюда — сотрудник отвечал бы на «линию
    // начинения» один раз за смену, и вся регулярность превратилась бы в галочку.
    .filter((item) => hasTitle(item.title) && !isPeriodic(item))
    .map((item) => buildItemView(item, locales, labels));
  if (items.length === 0) return null;

  return {
    id: section.id,
    title: pickFillText(section.title, locales),
    items,
  };
}

export function buildFillView(input: BuildFillViewInput): FillScreenView {
  const sections = input.sections
    .map((section) => buildSectionView(section, input.locales, input.labels))
    .filter((section): section is FillSectionView => section !== null);

  const totalItems = sections.reduce(
    (total, section) => total + section.items.length,
    0,
  );

  const where = joinNonEmpty(
    [
      input.storeName,
      input.stationName,
      formatWindow(input.windowStart, input.windowEnd),
    ],
    TEXT_PART_SEPARATOR,
  );

  return {
    checklistTitle: pickFillText(input.checklistTitle, input.locales),
    where,
    sections,
    totalItems,
  };
}

export interface BuildChoiceViewInput {
  readonly options: readonly FillChoiceOption[];
  readonly storeName: string;
  readonly stationName: string;
  readonly locales: readonly Locale[];
}

/**
 * Список чек-листов, открытых на станции в одну минуту (D021 не нарушается: это те
 * же названия и окна, что сотрудник увидит, открыв любой из них, — ничего сверх).
 *
 * Порядок приходит снизу и здесь не пересортировывается: слой данных ставит их по
 * началу окна, и список обязан выглядеть одинаково при каждом сканировании — иначе
 * сотрудник, привыкший тыкать во вторую строку, однажды откроет не то.
 */
export function buildChoiceView(input: BuildChoiceViewInput): FillChoiceView {
  return {
    where: joinNonEmpty(
      [input.storeName, input.stationName],
      TEXT_PART_SEPARATOR,
    ),
    options: input.options.map((option) => ({
      checklistId: option.checklistId,
      title: pickFillText(option.title, input.locales),
      window: option.window,
    })),
  };
}
