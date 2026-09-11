"use server";

// Серверные действия библиотеки. Каждое зовёт requireAdmin() само: действия выполняются
// мимо дерева разметки, и охрана в src/app/admin/layout.tsx их не закрывает.
//
// Наружу уходит код отказа, а не текст: экран двуязычный и сообщение выбирает он.
// Подробности отказа остаются в журнале сервера — браузеру знать их незачем.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/blocks/auth/guard";

import { blockInputFrom, failureState, formText } from "./action-input";
import type { LibraryActionState } from "./action-state";
import { createBlock, saveBlock } from "./blocks";
import { EditorInputError } from "./parsing";
import { libraryBlockPath, LIBRARY_PATH } from "./routes";

/**
 * Отказ для экрана. Разбор и выбор кода живут в `action-input.ts` и покрыты тестами;
 * здесь остаётся то, чего в чистой функции быть не может, — запись в журнал сервера.
 * Молча проглоченный сбой означал бы, что методист считает блок сохранённым.
 */
function failure(error: unknown): LibraryActionState {
  if (!(error instanceof EditorInputError)) {
    console.error("Библиотека: непредвиденный сбой действия", error);
  }
  return failureState(error);
}

/**
 * «+ Новый блок»: заводит пустой блок с названием по умолчанию и сразу открывает его.
 * Отдельной формы с названием нет намеренно — название правится тем же полем, что и
 * потом, а лишний экран стоил бы методисту двух касаний на каждом блоке (принцип 5).
 */
export async function submitCreateBlock(form: FormData): Promise<void> {
  await requireAdmin();

  let blockId: string;
  try {
    blockId = await createBlock({
      [formText(form, "locale")]: formText(form, "title"),
    });
  } catch (error) {
    if (!(error instanceof EditorInputError)) throw error;
    console.error("Библиотека: блок не завёлся", error);
    redirect(LIBRARY_PATH);
  }

  // redirect() бросает исключение управления потоком — он обязан быть вне try/catch,
  // иначе переход будет пойман как отказ и методист останется на прежнем экране.
  revalidatePath(LIBRARY_PATH);
  redirect(libraryBlockPath(blockId));
}

/**
 * «Сохранить блок»: название и пункты уходят одним действием.
 *
 * Версий чек-листов это действие не касается вовсе — именно поэтому правка приходит
 * во все черновики и не меняет ни одной опубликованной версии (T029, принцип 3).
 */
export async function submitSaveBlock(
  _previous: LibraryActionState,
  form: FormData,
): Promise<LibraryActionState> {
  await requireAdmin();

  try {
    const blockId = formText(form, "blockId");
    await saveBlock(blockId, blockInputFrom(form));
    // Список слева показывает название и число пунктов — после правки он устарел.
    revalidatePath(LIBRARY_PATH);
    return { status: "saved" };
  } catch (error) {
    return failure(error);
  }
}
