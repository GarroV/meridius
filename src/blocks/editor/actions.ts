"use server";

// Серверные действия редактора. Каждое зовёт requireAdmin() само: действия выполняются
// мимо дерева разметки, и охрана в src/app/admin/layout.tsx их не закрывает.
//
// Наружу уходит код отказа, а не текст: экран двуязычный и сообщение выбирает он.
// Подробности отказа остаются в журнале сервера — браузеру знать их незачем.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/blocks/auth/guard";

import {
  checklistInputFrom,
  failureState,
  formText,
  sectionsFrom,
} from "./action-input";
import type { EditorActionState } from "./action-state";
import { createChecklist, saveDraft, updateChecklist } from "./drafts";
import { duplicateChecklist } from "./duplicate";
import { publish } from "./publish";
import { removeChecklist } from "./removal";
import { CHECKLISTS_PATH, checklistPath } from "./routes";
import { closedWindowNow } from "./station-clock";
import { EditorInputError } from "./validation";

/**
 * Отказ для экрана. Разбор и выбор кода живут в `action-input.ts` и покрыты тестами;
 * здесь остаётся то, чего в чистой функции быть не может, — запись в журнал сервера.
 * Молча проглоченный сбой означал бы, что методист считает работу сохранённой.
 */
function failure(error: unknown): EditorActionState {
  if (!(error instanceof EditorInputError)) {
    console.error("Редактор: непредвиденный сбой действия", error);
  }
  return failureState(error);
}

/** Заведение чек-листа с экрана «Новый чек-лист». Успех уводит сразу в редактор. */
export async function submitCreateChecklist(
  _previous: EditorActionState,
  form: FormData,
): Promise<EditorActionState> {
  await requireAdmin();

  let checklistId: string;
  try {
    checklistId = await createChecklist(checklistInputFrom(form));
  } catch (error) {
    return failure(error);
  }

  // redirect() бросает исключение управления потоком — он обязан быть вне try/catch,
  // иначе переход будет пойман как отказ и методист останется на пустой форме.
  revalidatePath(CHECKLISTS_PATH);
  redirect(checklistPath(checklistId));
}

/** «Сохранить черновик»: свойства чек-листа и разметка уходят одним действием. */
export async function submitSaveDraft(
  _previous: EditorActionState,
  form: FormData,
): Promise<EditorActionState> {
  await requireAdmin();

  try {
    const checklistId = formText(form, "checklistId");
    const sections = sectionsFrom(form);
    await updateChecklist(checklistId, checklistInputFrom(form));
    await saveDraft(checklistId, sections);
    revalidatePath(checklistPath(checklistId));
    return { status: "saved" };
  } catch (error) {
    return failure(error);
  }
}

/**
 * «Опубликовать»: сначала сохраняется то, что на экране, потом создаётся версия.
 * Иначе опубликовалось бы прошлое сохранение, а методист смотрел бы на свежие правки.
 */
export async function submitPublish(
  _previous: EditorActionState,
  form: FormData,
): Promise<EditorActionState> {
  await requireAdmin();

  try {
    const checklistId = formText(form, "checklistId");
    const sections = sectionsFrom(form);
    const input = checklistInputFrom(form);
    await updateChecklist(checklistId, input);
    await saveDraft(checklistId, sections);
    const version = await publish(checklistId);
    // Окно сверяется ПОСЛЕ публикации и по часам пиццерии (T275). Подсказка у станции
    // посчитана при отрисовке страницы и к этому мгновению могла устареть — ровно так
    // и выглядит случай, из которого задача родилась: экран открыт в 10:50, нажатие в
    // 11:30, утреннее окно закрылось между ними, и методист об этом нигде не прочитал.
    const closedWindow = await closedWindowNow(checklistId, input.window);
    revalidatePath(checklistPath(checklistId));
    return {
      status: "published",
      ...(version.versionNumber === null
        ? {}
        : { versionNumber: version.versionNumber }),
      ...(closedWindow === null ? {} : { closedWindow }),
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Дублирование со списка чек-листов: обычное действие формы, без состояния. Успех
 * открывает копию в редакторе — методист попадает сразу туда, где будет её править.
 *
 * Отказ разбора здесь означает одно: исходный чек-лист исчез, пока список был открыт.
 * Тогда возвращаемся в список — он перечитается и покажет, что есть на самом деле.
 * Всё остальное пробрасывается: молча проглоченный сбой хуже страницы с ошибкой.
 */
/**
 * «Удалить чек-лист» с экрана подтверждения. Что именно произойдёт — решает `removeChecklist`
 * по наличию заполнений; экран подтверждения показал это заранее, а здесь остаётся выполнить.
 * Успех и отказ ведут в список: удалённого чек-листа больше нет, возвращать методиста
 * на его редактор — значит показать ему 404.
 */
export async function submitDeleteChecklist(form: FormData): Promise<void> {
  await requireAdmin();

  try {
    await removeChecklist(formText(form, "checklistId"));
  } catch (error) {
    if (!(error instanceof EditorInputError)) throw error;
    console.error("Редактор: удаление не состоялось", error);
  }

  revalidatePath(CHECKLISTS_PATH);
  redirect(CHECKLISTS_PATH);
}

export async function submitDuplicate(form: FormData): Promise<void> {
  await requireAdmin();

  let copyId: string;
  try {
    copyId = await duplicateChecklist(formText(form, "checklistId"));
  } catch (error) {
    if (!(error instanceof EditorInputError)) throw error;
    console.error("Редактор: дублирование не состоялось", error);
    revalidatePath(CHECKLISTS_PATH);
    redirect(CHECKLISTS_PATH);
  }

  revalidatePath(CHECKLISTS_PATH);
  redirect(checklistPath(copyId));
}
