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

import {
  requireChecklistEditable,
  requireStations,
  requireVisible,
} from "@/blocks/auth/access";
import { requireAdmin } from "@/blocks/auth/guard";
import {
  assignChecklist,
  detachChecklist,
  reissueStationCode,
} from "@/blocks/catalog";
import { decideReissue } from "@/blocks/core/reissue-confirmation";
import { copyTemplateToStations } from "@/blocks/editor/templates";

import {
  CONFIRM_REISSUE,
  STATION_IDS_PARAM,
  STATIONS_PATH,
  stationConfirmHref,
  stationHref,
  stickersHref,
} from "./view";

const STATION_ID = "stationId";
const CHECKLIST_ID = "checklistId";
const TEMPLATE_ID = "templateId";
/** Поле подтверждения, которое добавляет окно `core/ui/ConfirmDialog`. */
const CONFIRMED = "confirmed";

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
  const viewer = await requireAdmin();
  const stationId = field(form, STATION_ID);
  const checklistId = field(form, CHECKLIST_ID);
  // Станция и чек-лист приходят из формы: чужие отвечают как несуществующие (D145).
  await requireVisible(viewer, "station", stationId);
  await requireChecklistEditable(viewer, checklistId);
  await assignChecklist(stationId, checklistId);
  backToStation(stationId);
}

export async function submitDetachChecklist(form: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const checklistId = field(form, CHECKLIST_ID);
  await requireChecklistEditable(viewer, checklistId);
  await detachChecklist(checklistId);
  backToStation(field(form, STATION_ID));
}

/**
 * Перевыпуск кода станции — только после подтверждения (T266, T312).
 *
 * Правило общее с листом QR и справочником (`core/reissue-confirmation.ts`): первое
 * нажатие ничего не меняет, а открывает на карточке окно с именем станции и
 * предупреждением, что старая наклейка умрёт сразу. Подтверждённый перевыпуск ведёт
 * на печать новой наклейки этой станции: без неё человек ушёл бы со старой наклейкой
 * на станции и новым кодом в базе.
 *
 * Отказ справочника (станции нет) не глотается: он уходит пятисоткой с записью в
 * журнал, а не тихим возвратом «как будто вышло».
 */
export async function submitReissueCode(form: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const stationId = field(form, STATION_ID);
  // Чужая станция из формы — «такой нет» (D145): код не перевыпускается.
  await requireVisible(viewer, "station", stationId);

  const decision = decideReissue({
    stationId,
    confirmed: field(form, CONFIRMED) === "1",
    ask: stationConfirmHref(stationId, CONFIRM_REISSUE),
    doneHref: stickersHref([stationId]),
    fail: stationHref(stationId),
  });

  // redirect бросает исключение — до перевыпуска выполнение отсюда не доходит.
  if (decision.kind === "confirm") redirect(decision.view);

  await reissueStationCode(decision.stationId);
  revalidatePath(stationHref(stationId));
  redirect(decision.doneHref);
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
  const viewer = await requireAdmin();

  const templateId = field(form, TEMPLATE_ID);
  const stationIds = form
    .getAll(STATION_IDS_PARAM)
    .flatMap((value) => (typeof value === "string" && value ? [value] : []));

  if (templateId === "" || stationIds.length === 0) {
    redirect(STATIONS_PATH);
  }

  // Одна чужая станция в списке — отказ целиком, а не раскатка «на часть» (D145).
  await requireStations(viewer, stationIds);
  const outcome = await copyTemplateToStations(
    templateId,
    stationIds,
    new Date(),
    viewer.tenantId,
  );

  revalidatePath(STATIONS_PATH, "layout");
  // Итог уезжает в адрес, а не в состояние экрана: человек, раскатавший на сорок
  // станций, обязан увидеть, на сколько именно легло и сколько пропущено, — и увидеть
  // это после перезагрузки тоже.
  redirect(
    `${STATIONS_PATH}?copied=${String(outcome.copied.length)}&skipped=${String(outcome.skipped.length)}`,
  );
}
