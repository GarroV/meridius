"use server";

// Серверные действия справочника. Каждое зовёт `requireAdmin()` само: охрана в
// разметке `src/app/admin/layout.tsx` действия не закрывает — они выполняются мимо
// дерева разметки. Формы обычные, поэтому справочник правится и без JavaScript.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/blocks/auth/guard";

import { createCountry, deleteCountry, updateCountry } from "../countries";
import { CatalogError } from "../errors";
import {
  assignChecklist,
  createStation,
  deleteStation,
  detachChecklist,
  reissueStationCode,
  updateStation,
} from "../stations";
import { createStore, deleteStore, updateStore } from "../stores";
import {
  afterDeleteStoreFailure,
  formField,
  hrefOf,
  reissueOutcome,
} from "./outcomes";
import { CATALOG_PATH, catalogHref, type CatalogView } from "./view";

const NAME = "name";
const LOCALE = "locale";
const TIMEZONE = "timezone";
const COUNTRY_ID = "countryId";
const STORE_ID = "storeId";
const STATION_ID = "stationId";
const CHECKLIST_ID = "checklistId";
const ID = "id";
const CONFIRMED = "confirmed";

/**
 * Выполняет действие и уводит человека дальше: успех — по адресу, который выбрало
 * само действие, отказ справочника — назад в справочник с кодом отказа в адресе,
 * чтобы экран показал текст. Чужие исключения не глотаются: молча съеденная ошибка
 * неотличима от успеха.
 */
async function perform<T>(
  action: () => Promise<T>,
  // Строкой — когда успех уводит с экрана вовсе: так делает один перевыпуск кода,
  // он заканчивается печатью наклейки, а не справочником.
  onSuccess: (result: T) => CatalogView | string,
  onFailure: (error: CatalogError) => CatalogView,
): Promise<void> {
  await requireAdmin();

  // Отказ всегда возвращает в справочник: показать его больше негде.
  let target: CatalogView | string;
  try {
    target = onSuccess(await action());
  } catch (error) {
    if (!(error instanceof CatalogError)) throw error;
    target = onFailure(error);
  }

  revalidatePath(CATALOG_PATH);
  // redirect бросает исключение — код ниже не выполняется, и это единственный выход.
  redirect(hrefOf(target));
}

/** Куда вернуться, если действие не удалось: то же место дерева плюс код отказа. */
function backTo(view: CatalogView) {
  return (error: CatalogError): CatalogView => ({ ...view, error: error.code });
}

export async function submitCreateCountry(form: FormData): Promise<void> {
  await perform(
    () =>
      createCountry({
        name: formField(form, NAME),
        locale: formField(form, LOCALE),
      }),
    (id) => ({ countryId: id, focus: "country" }),
    backTo({ create: "country" }),
  );
}

export async function submitUpdateCountry(form: FormData): Promise<void> {
  const countryId = formField(form, ID);
  await perform(
    () =>
      updateCountry(countryId, {
        name: formField(form, NAME),
        locale: formField(form, LOCALE),
      }),
    () => ({ countryId, focus: "country" }),
    backTo({ countryId, focus: "country" }),
  );
}

/**
 * Удаление страны. Как у станции, подтверждение держит экран: неподтверждённый
 * запрос ничего не удаляет, а уводит экран в состояние вопроса (T267).
 *
 * Почему вопрос нужен, хотя потерять нечего. Слой не даёт снести страну, в которой
 * есть пиццерии (`countries.ts`: `countryNotEmpty`), то есть каскадом не умирает
 * ничего, а цена промаха — завести название и язык заново. Дело не в цене, а в
 * правиле экрана: станция спрашивает, пиццерия спрашивает, а страна сносилась с
 * одного нажатия. Правило, которое срабатывает не всегда, человек перестаёт
 * считать правилом — и это дороже одной перезаведённой страны.
 */
export async function submitDeleteCountry(form: FormData): Promise<void> {
  const countryId = formField(form, ID);
  const confirmed = formField(form, CONFIRMED) === "1";

  if (!confirmed) {
    await requireAdmin();
    redirect(catalogHref({ countryId, focus: "country", confirm: "country" }));
  }

  await perform(
    () => deleteCountry(countryId),
    () => ({}),
    backTo({ countryId, focus: "country" }),
  );
}

export async function submitCreateStore(form: FormData): Promise<void> {
  const countryId = formField(form, COUNTRY_ID);
  await perform(
    () =>
      createStore({
        countryId,
        name: formField(form, NAME),
        timezone: formField(form, TIMEZONE),
      }),
    (id) => ({ countryId, storeId: id, focus: "store" }),
    backTo({ countryId, create: "store" }),
  );
}

export async function submitUpdateStore(form: FormData): Promise<void> {
  const countryId = formField(form, COUNTRY_ID);
  const storeId = formField(form, ID);
  await perform(
    () =>
      updateStore(storeId, {
        name: formField(form, NAME),
        timezone: formField(form, TIMEZONE),
      }),
    () => ({ countryId, storeId, focus: "store" }),
    backTo({ countryId, storeId, focus: "store" }),
  );
}

/**
 * Удаление пиццерии. Кнопка отправляет форму без подтверждения; если станции есть,
 * слой отказывает кодом `confirmationRequired`, и экран показывает подтверждение
 * со счётчиком станций. Так подтверждение держится правилом слоя, а не памятью
 * того, кто рисовал кнопку.
 */
export async function submitDeleteStore(form: FormData): Promise<void> {
  const countryId = formField(form, COUNTRY_ID);
  const storeId = formField(form, ID);
  const confirmed = formField(form, CONFIRMED) === "1";

  await perform(
    () => deleteStore(storeId, { confirmed }),
    () => ({ countryId }),
    (error) =>
      afterDeleteStoreFailure({ countryId, storeId, focus: "store" }, error),
  );
}

export async function submitCreateStation(form: FormData): Promise<void> {
  const countryId = formField(form, COUNTRY_ID);
  const storeId = formField(form, STORE_ID);
  await perform(
    () => createStation({ storeId, name: formField(form, NAME) }),
    (created) => ({
      countryId,
      storeId,
      stationId: created.id,
      focus: "station",
    }),
    backTo({ countryId, storeId, create: "station" }),
  );
}

export async function submitUpdateStation(form: FormData): Promise<void> {
  const countryId = formField(form, COUNTRY_ID);
  const storeId = formField(form, STORE_ID);
  const stationId = formField(form, ID);
  await perform(
    () => updateStation(stationId, { name: formField(form, NAME) }),
    () => ({ countryId, storeId, stationId, focus: "station" }),
    backTo({ countryId, storeId, stationId, focus: "station" }),
  );
}

export async function submitDeleteStation(form: FormData): Promise<void> {
  const countryId = formField(form, COUNTRY_ID);
  const storeId = formField(form, STORE_ID);
  const stationId = formField(form, ID);
  const confirmed = formField(form, CONFIRMED) === "1";

  // У станции подтверждение спрашивает экран, а не слой: удаление станции ничего
  // каскадом не сносит, но код её QR перестаёт работать — предупредить обязаны.
  if (!confirmed) {
    await requireAdmin();
    redirect(
      catalogHref({
        countryId,
        storeId,
        stationId,
        focus: "station",
        confirm: "station",
      }),
    );
  }

  await perform(
    () => deleteStation(stationId),
    () => ({ countryId, storeId, focus: "store" }),
    backTo({ countryId, storeId, stationId, focus: "station" }),
  );
}

/**
 * Перевыпуск кода станции. Как и удаление станции, без подтверждения не делается:
 * неподтверждённый запрос уводит экран в состояние «спросить», и только со вторым
 * нажатием код меняется. Дальше экран уходит не в справочник, а на печать новой
 * наклейки — решение и его причина в `reissueOutcome` (T260).
 */
export async function submitReissueCode(form: FormData): Promise<void> {
  const outcome = reissueOutcome({
    countryId: formField(form, COUNTRY_ID),
    storeId: formField(form, STORE_ID),
    stationId: formField(form, ID),
    confirmed: formField(form, CONFIRMED) === "1",
  });

  if (outcome.kind === "confirm") {
    await requireAdmin();
    redirect(catalogHref(outcome.view));
  }

  await perform(
    () => reissueStationCode(outcome.stationId),
    () => outcome.doneHref,
    backTo(outcome.failView),
  );
}

export async function submitAssignChecklist(form: FormData): Promise<void> {
  const countryId = formField(form, COUNTRY_ID);
  const storeId = formField(form, STORE_ID);
  const stationId = formField(form, STATION_ID);
  await perform(
    () => assignChecklist(stationId, formField(form, CHECKLIST_ID)),
    () => ({ countryId, storeId, stationId, focus: "station" }),
    backTo({ countryId, storeId, stationId, focus: "station" }),
  );
}

export async function submitDetachChecklist(form: FormData): Promise<void> {
  const countryId = formField(form, COUNTRY_ID);
  const storeId = formField(form, STORE_ID);
  const stationId = formField(form, STATION_ID);
  await perform(
    () => detachChecklist(formField(form, CHECKLIST_ID)),
    () => ({ countryId, storeId, stationId, focus: "station" }),
    backTo({ countryId, storeId, stationId, focus: "station" }),
  );
}
