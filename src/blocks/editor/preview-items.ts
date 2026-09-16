// Что предпросмотр показывает формой, а что — состоянием пункта (T137).
//
// Периодический пункт в форму заполнения НЕ идёт: его отмечают обходом по расписанию,
// и экран станции держит его отдельной строкой с ближайшим временем (D076, блок `fill`,
// `view.ts#buildSectionView`). Предпросмотр обещает «так это увидит сотрудник», поэтому
// он обязан делить пункты ровно там же — иначе методист поставит регулярность и увидит
// в предпросмотре обычную галочку, то есть неправду.
//
// Сетка часов сюда не возвращается и здесь: на бумаге её рисуют потому, что иначе
// регулярность не покажешь, а в продукте она уехала в отчёт (D065).
import type { Item, LocalizedText, Section } from "@/blocks/data";
import { isPeriodic } from "@/blocks/data";

/** Периодический пункт вместе с названием секции, из которой он вынут. */
export interface PeriodicItemView {
  readonly item: Item;
  readonly sectionTitle: LocalizedText;
}

export interface PreviewSplit {
  /** Секции формы: без периодических пунктов; опустевшая секция выпадает целиком. */
  readonly sections: Section[];
  /** Пункты обхода в порядке чек-листа — панель стоит одна на весь экран. */
  readonly periodic: PeriodicItemView[];
}

export function splitPeriodic(sections: readonly Section[]): PreviewSplit {
  const periodic: PeriodicItemView[] = [];
  const kept: Section[] = [];

  for (const section of sections) {
    for (const item of section.items) {
      if (isPeriodic(item)) {
        periodic.push({ item, sectionTitle: section.title });
      }
    }
    const items = section.items.filter((item) => !isPeriodic(item));
    // Заголовок секции без единой строки под ним сотруднику ничего не говорит — то же
    // правило, что у пунктов без названия в `PreviewScreen#visibleSections`.
    if (items.length > 0) kept.push({ ...section, items });
  }

  return { sections: kept, periodic };
}
