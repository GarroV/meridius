"use server";

// Серверные действия экрана QR. Перевыпуск зовёт `requireAdmin()` сам: охрана в
// разметке `src/app/admin/layout.tsx` действия не закрывает — они выполняются мимо
// дерева разметки. Форма обычная, поэтому кнопка работает и без JavaScript.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CatalogError, reissueStationCode } from "@/blocks/catalog";
import { requireAdmin } from "@/blocks/auth/guard";

import { reissueOutcome } from "./outcomes";
import { QR_PATH, isQrErrorCode, qrHref, type QrErrorCode } from "./view";

const STORE_ID = "storeId";
const STATION_ID = "stationId";
const CONFIRMED = "confirmed";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Выдаёт станции новый код (D006) — но только после подтверждения (T266).
 *
 * Неподтверждённый запрос НИЧЕГО не меняет: экран уходит в состояние вопроса, и
 * человек видит окно с названием станции и предупреждением. Правило общее со
 * справочником и живёт в `core/reissue-confirmation.ts`. До T266 здесь стоял
 * `reissueStationCode()` сразу после охраны — то есть промах мимо кнопки убивал
 * все напечатанные наклейки станции, и отменить это было нечем.
 *
 * Проверка стоит в действии, а не в разметке кнопки: прямая отправка формы мимо
 * окна в вебе бесплатна и никакой кнопки не касается.
 */
export async function submitReissueCode(form: FormData): Promise<void> {
  await requireAdmin();

  const outcome = reissueOutcome({
    storeId: field(form, STORE_ID),
    stationId: field(form, STATION_ID),
    confirmed: field(form, CONFIRMED) === "1",
  });

  // redirect бросает исключение — до перевыпуска выполнение отсюда не доходит.
  if (outcome.kind === "confirm") redirect(qrHref(outcome.view));

  let error: QrErrorCode | null = null;
  try {
    await reissueStationCode(outcome.stationId);
  } catch (cause) {
    // Чужое исключение не глотаем: молча съеденная ошибка неотличима от успеха.
    // Отказ справочника, которого этот экран показать не умеет, — тоже: пусть
    // будет пятисотка со строкой в журнале, а не тихий возврат «как будто вышло».
    if (!(cause instanceof CatalogError) || !isQrErrorCode(cause.code)) {
      throw cause;
    }
    error = cause.code;
  }

  revalidatePath(QR_PATH);
  // redirect бросает исключение — код ниже не выполняется, и это единственный выход.
  redirect(
    error === null ? outcome.doneHref : qrHref({ ...outcome.failView, error }),
  );
}
