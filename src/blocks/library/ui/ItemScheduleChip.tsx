"use client";

// Чип регулярности в строке пункта блока библиотеки (D096, T198).
//
// Показ, а не управление — и это не полумера, а прямое следствие D097. Чтобы ЗАДАТЬ
// расписание, нужны часы начала и конца отрезка, то есть окно; окна у блока нет и не
// заводится, потому что один блок живёт сразу в нескольких чек-листах с разными окнами.
// Кнопка, открывающая окно настройки, здесь означала бы либо выдуманное окно «сутки
// целиком» (это и есть отклонённый вариант «дать блоку своё окно»), либо новое поле в
// схеме под относительный шаг. Поэтому чип — `span`: он сообщает состояние пункта и
// ничего не обещает нажатием.
//
// «Ничего не обещает» — это про ВИД, а не только про тег (T224, дефект #101). До этой
// правки чип брал общий вид чипа целиком и вместе с ним откликался на наведение, как
// управление: на телефоне такого отклика нет вовсе, а мышью пункт менял цвет рамки и
// текста и не делал ничего. Поэтому берётся только коробка и цвета, а `CHIP_ACTION_CLASS`
// и `CHIP_OFF_HOVER_CLASS` — признаки нажимаемого — сознательно НЕ берутся. Кольца фокуса
// здесь нет по той же причине: `span` без `tabindex` фокус не принимает, и правило про
// фокус в его вёрстке — обещание, которое некому исполнить.
//
// Подписи берутся из раздела `editor.schedule`, а не из своего: та же фраза в двух
// словарях разъехалась бы молча — на одном экране «каждые 2 часа», на другом «120 минут»,
// и методист решил бы, что видит две разные настройки.
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { Item } from "@/blocks/data";
import {
  CHIP_CLASS,
  CHIP_OFF_CLASS,
  CHIP_ON_CLASS,
} from "@/blocks/editor/ui/ScheduleChip";
import { stepLabel } from "@/blocks/editor/ui/step-label";

import { blockScheduleSummary } from "./item-schedule";

/** Разделитель между шагами, когда их несколько: перечисление, а не диапазон. */
const STEPS_SEPARATOR = ", ";

export function ItemScheduleChip({
  item,
}: {
  readonly item: Item;
}): ReactElement {
  const t = useTranslations("editor.schedule");
  const summary = blockScheduleSummary(item);

  const label =
    summary.kind === "none"
      ? t("chipOnce")
      : summary.kind === "every"
        ? stepLabel(summary.everyMinutes, t)
        : summary.steps
            .map((minutes) => stepLabel(minutes, t))
            .join(STEPS_SEPARATOR);

  return (
    <span
      data-testid="item-schedule-chip"
      data-kind={summary.kind}
      // Признак относительного вида: тот же чип на экране редактора открывается
      // нажатием, этот — нет, и снаружи их надо различать.
      data-relative="true"
      className={`${CHIP_CLASS} ${
        summary.kind === "none" ? CHIP_OFF_CLASS : CHIP_ON_CLASS
      }`}
    >
      {label}
    </span>
  );
}
