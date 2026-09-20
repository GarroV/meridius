import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { AdminShell } from "@/blocks/core/ui/AdminShell";
import { ConfirmDialog } from "@/blocks/core/ui/ConfirmDialog";

import {
  submitDeleteStation,
  submitDeleteStore,
  submitReissueCode,
} from "./actions";
import { CatalogTree } from "./CatalogTree";
import { DetailCards } from "./DetailCards";
import type { CatalogModel, StationDetail, StoreDetail } from "./model";

/**
 * Экран справочника «Страны и пиццерии» (T018) — сборка каркаса, дерева и
 * карточки правки/подтверждения по эталону
 * `docs/furca/design/screens/catalog.html`. Сам почти ничего не считает: всё
 * нужное уже лежит в `model` (см. `ui/build-model.ts`).
 *
 * Карточки подтверждения удаления (`ConfirmCard`) держатся здесь, а не рядом с
 * карточками правки: это отдельный режим экрана («что показано под деревом» —
 * решение композиции), а не правка сущности.
 */

type Translate = Awaited<ReturnType<typeof getTranslations>>;

const FIELD_ID = "id";
const FIELD_COUNTRY_ID = "countryId";
const FIELD_STORE_ID = "storeId";
const FIELD_CONFIRMED = "confirmed";

// Повторяющийся ключ словаря — в константу (sonarjs/no-duplicate-string).
const KEY_ACTION_CANCEL = "actions.cancel";

const ERROR_NOTICE_CLASS =
  "text-err flex gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)]";
// Ссылка, а не кнопка: переход внутри кабинета идёт роутером Next (D046, T088).
// Классы те же, что у кнопки верхней полосы в эталоне, минус вид «неактивна» —
// неактивной эта кнопка больше не бывает.
const TOPBAR_LINK_CLASS =
  "text-ink bg-surface inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";
const CONFIRM_CARD_CLASS =
  "flex max-w-[880px] flex-col gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] p-[var(--space-7)] shadow-[var(--sh-xs)]";
const CONFIRM_TITLE_CLASS =
  "text-err text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const CONFIRM_TEXT_CLASS = "text-err m-0 text-[length:var(--fs-dense)]";
const INLINE_CLASS = "flex items-center gap-[var(--space-5)]";
const BTN_GHOST_CLASS =
  "inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";
const BTN_DANGER_CLASS =
  "border-err bg-err inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:opacity-90";

function ConfirmDeleteStore({
  store,
  countryId,
  cancelHref,
  t,
}: {
  readonly store: StoreDetail;
  readonly countryId: string;
  readonly cancelHref: string;
  readonly t: Translate;
}): ReactElement {
  return (
    <div data-testid="confirm-card" className={CONFIRM_CARD_CLASS}>
      <h2 className={CONFIRM_TITLE_CLASS}>
        {t("confirm.deleteStoreTitle", { name: store.name })}
      </h2>
      <p className={CONFIRM_TEXT_CLASS}>
        {t("confirm.deleteStoreBody", { count: store.stationCount })}
      </p>
      <p className={CONFIRM_TEXT_CLASS}>{t("confirm.deleteStoreWarning")}</p>
      <div className={INLINE_CLASS}>
        <form action={submitDeleteStore}>
          <input type="hidden" name={FIELD_ID} value={store.id} />
          <input type="hidden" name={FIELD_COUNTRY_ID} value={countryId} />
          <input type="hidden" name={FIELD_CONFIRMED} value="1" />
          <button type="submit" className={BTN_DANGER_CLASS}>
            {t("actions.confirmDelete")}
          </button>
        </form>
        <Link href={cancelHref} className={BTN_GHOST_CLASS}>
          {t(KEY_ACTION_CANCEL)}
        </Link>
      </div>
    </div>
  );
}

function ConfirmDeleteStation({
  station,
  countryId,
  storeId,
  cancelHref,
  t,
}: {
  readonly station: StationDetail;
  readonly countryId: string;
  readonly storeId: string;
  readonly cancelHref: string;
  readonly t: Translate;
}): ReactElement {
  return (
    <div data-testid="confirm-card" className={CONFIRM_CARD_CLASS}>
      <h2 className={CONFIRM_TITLE_CLASS}>
        {t("confirm.deleteStationTitle", { name: station.name })}
      </h2>
      <p className={CONFIRM_TEXT_CLASS}>{t("confirm.deleteStationBody")}</p>
      <div className={INLINE_CLASS}>
        <form action={submitDeleteStation}>
          <input type="hidden" name={FIELD_ID} value={station.id} />
          <input type="hidden" name={FIELD_COUNTRY_ID} value={countryId} />
          <input type="hidden" name={FIELD_STORE_ID} value={storeId} />
          <input type="hidden" name={FIELD_CONFIRMED} value="1" />
          <button type="submit" className={BTN_DANGER_CLASS}>
            {t("actions.confirmDelete")}
          </button>
        </form>
        <Link href={cancelHref} className={BTN_GHOST_CLASS}>
          {t(KEY_ACTION_CANCEL)}
        </Link>
      </div>
    </div>
  );
}

/** Какая карточка подтверждения нужна — решает `model.confirm`, а не разметка внутри. */
function ConfirmCard({
  model,
  t,
}: {
  readonly model: CatalogModel;
  readonly t: Translate;
}): ReactElement | null {
  const { confirm, countryId, storeId, store, station, hrefs } = model;

  if (confirm === "store" && store !== null && countryId !== null) {
    return (
      <ConfirmDeleteStore
        store={store}
        countryId={countryId}
        cancelHref={hrefs.cancel}
        t={t}
      />
    );
  }
  if (
    confirm === "station" &&
    station !== null &&
    countryId !== null &&
    storeId !== null
  ) {
    return (
      <ConfirmDeleteStation
        station={station}
        countryId={countryId}
        storeId={storeId}
        cancelHref={hrefs.cancel}
        t={t}
      />
    );
  }
  return null;
}

/**
 * Окно подтверждения перевыпуска кода станции — только когда известно всё, что оно
 * называет: сама станция (её имя стоит в заголовке) и место в дереве, куда вернёт
 * «Отмена». Половины окна не бывает: без имени станции вопрос «перевыпустить код?»
 * не отличает одну станцию от соседней.
 */
function ReissueConfirm({
  model,
  t,
}: {
  readonly model: CatalogModel;
  readonly t: Translate;
}): ReactElement | null {
  const { confirm, countryId, storeId, station, hrefs } = model;

  if (
    confirm !== "reissue" ||
    station === null ||
    countryId === null ||
    storeId === null
  ) {
    return null;
  }

  return (
    <ConfirmDialog
      name="reissue"
      action={submitReissueCode}
      fields={{
        [FIELD_ID]: station.id,
        [FIELD_COUNTRY_ID]: countryId,
        [FIELD_STORE_ID]: storeId,
      }}
      title={t("confirm.reissueTitle", { name: station.name })}
      warning={t("confirm.reissueBody")}
      confirmLabel={t("actions.confirmReissue")}
      cancelLabel={t(KEY_ACTION_CANCEL)}
      cancelHref={hrefs.cancel}
    />
  );
}

export async function CatalogScreen({
  model,
}: {
  readonly model: CatalogModel;
}): Promise<ReactElement> {
  const t = await getTranslations("catalog");

  return (
    <AdminShell
      testId="catalog-screen"
      active="catalog"
      breadcrumb={t("breadcrumb")}
      title={t("title")}
      topbarAction={
        <Link
          href={model.hrefs.qrStations}
          data-testid="catalog-qr-stations"
          className={TOPBAR_LINK_CLASS}
        >
          {t("actions.qrStations")}
        </Link>
      }
    >
      {model.errorCode !== null ? (
        <p data-testid="catalog-error" className={ERROR_NOTICE_CLASS}>
          {t(`errors.${model.errorCode}`)}
        </p>
      ) : null}
      <CatalogTree model={model} />
      {/* Подтверждение удаления заменяет карточку правки — оно и есть то, что показано
          под деревом. Подтверждение перевыпуска ничего не заменяет: это окно поверх
          экрана, и под ним остаётся ровно то, что было (T260). */}
      {model.confirm === "store" || model.confirm === "station" ? (
        <ConfirmCard model={model} t={t} />
      ) : (
        <DetailCards model={model} />
      )}
      <ReissueConfirm model={model} t={t} />
    </AdminShell>
  );
}
