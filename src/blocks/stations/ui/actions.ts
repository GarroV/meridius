"use server";

// Действия карточки станции.
//
// Зачем свои, когда такие же есть в справочнике. Сами операции общие и берутся у
// catalog — второй реализации назначения чек-листа в продукте быть не должно. Разное
// у них ровно одно: куда возвращать человека. Действия справочника уводят обратно в
// справочник с выбранной страной и пиццерией; человек, нажавший кнопку на карточке
// станции, обязан остаться на карточке станции. Копируется здесь возврат, а не работа.
//
// Каждое действие зовёт `requireAdmin()` само: тело серверного действия вызывает кто
// угодно и чем угодно, а не только наш экран, и охрана на маршруте его не прикрывает.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/blocks/auth/guard";
import {
  assignChecklist,
  detachChecklist,
  reissueStationCode,
} from "@/blocks/catalog";
import { copyTemplateToStations } from "@/blocks/editor/templates";

import { STATIONS_PATH, stationHref } from "./view";

const STATION_ID = "stationId";
const CHECKLIST_ID = "checklistId";
const TEMPLATE_ID = "templateId";
const STATION_IDS = "stationIds";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Общий хвост всех трёх действий: перерисовать карточку и вернуть на неё человека.
 *
 * `revalidatePath` обязателен и не заменяется редиректом: карточка рисуется на сервере
 * и без сброса кэша человек вернулся бы на неё в прежнем виде — нажал «привязать», а
 * на экране ничего не изменилось. Именно так это и выглядело бы: не ошибкой, а
 * неработающей кнопкой.
 */
function backToStation(stationId: string): never {
  const href = stationHref(stationId);
  revalidatePath(href);
  // Колонка станций живёт в разметке раздела (D163): без сброса разметки строка
  // держала бы «Нет чек-листа» у станции, которой его только что привязали.
  revalidatePath(STATIONS_PATH, "layout");
  redirect(href);
}

export async function submitAssignChecklist(form: FormData): Promise<void> {
  await requireAdmin();
  const stationId = field(form, STATION_ID);
  await assignChecklist(stationId, field(form, CHECKLIST_ID));
  backToStation(stationId);
}

export async function submitDetachChecklist(form: FormData): Promise<void> {
  await requireAdmin();
  await detachChecklist(field(form, CHECKLIST_ID));
  backToStation(field(form, STATION_ID));
}

export async function submitReissueCode(form: FormData): Promise<void> {
  await requireAdmin();
  const stationId = field(form, STATION_ID);
  await reissueStationCode(stationId);
  backToStation(stationId);
}

/**
 * Раскатка шаблона на выбранные станции — то самое «повесить чек-лист на всю страну».
 *
 * Именно копии, а не одно назначение: чек-лист принадлежит одной станции, и назначение
 * молча перевесило бы его с предыдущей на следующую, оставив остальные ни с чем.
 *
 * Пустой выбор возвращает человека назад, ничего не сделав. Это не придирка: «ничего не
 * выбрано» обязано означать «ничего не делать», а не «сделать со всеми».
 */
export async function submitCopyToStations(form: FormData): Promise<void> {
  await requireAdmin();

  const templateId = field(form, TEMPLATE_ID);
  const stationIds = form
    .getAll(STATION_IDS)
    .flatMap((value) => (typeof value === "string" && value ? [value] : []));

  if (templateId === "" || stationIds.length === 0) {
    redirect(STATIONS_PATH);
  }

  const outcome = await copyTemplateToStations(templateId, stationIds);

  revalidatePath(STATIONS_PATH, "layout");
  // Итог уезжает в адрес, а не в состояние экрана: человек, раскатавший на сорок
  // станций, обязан увидеть, на сколько именно легло и сколько пропущено, — и увидеть
  // это после перезагрузки тоже.
  redirect(
    `${STATIONS_PATH}?copied=${String(outcome.copied.length)}&skipped=${String(outcome.skipped.length)}`,
  );
}
