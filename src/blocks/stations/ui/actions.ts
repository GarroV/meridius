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

import { stationHref } from "./view";

const STATION_ID = "stationId";
const CHECKLIST_ID = "checklistId";

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
async function backToStation(stationId: string): Promise<never> {
  const href = stationHref(stationId);
  revalidatePath(href);
  redirect(href);
}

export async function submitAssignChecklist(form: FormData): Promise<void> {
  await requireAdmin();
  const stationId = field(form, STATION_ID);
  await assignChecklist(stationId, field(form, CHECKLIST_ID));
  await backToStation(stationId);
}

export async function submitDetachChecklist(form: FormData): Promise<void> {
  await requireAdmin();
  await detachChecklist(field(form, CHECKLIST_ID));
  await backToStation(field(form, STATION_ID));
}

export async function submitReissueCode(form: FormData): Promise<void> {
  await requireAdmin();
  const stationId = field(form, STATION_ID);
  await reissueStationCode(stationId);
  await backToStation(stationId);
}
