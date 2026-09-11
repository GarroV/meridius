import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import {
  submitCreateCountry,
  submitCreateStation,
  submitCreateStore,
  submitReissueCode,
} from "./actions";
import type { CatalogModel, StationItem, TreeItem } from "./model";

/**
 * Дерево справочника: три колонки «страны → пиццерии → станции» (эталон
 * `catalog.html`). Таблица станций — в этом же файле, по указанию задачи.
 */

type Translate = Awaited<ReturnType<typeof getTranslations>>;

// Имена полей форм — те же строки, что в actions.ts (там они приватные).
const FIELD_NAME = "name";
const FIELD_LOCALE = "locale";
const FIELD_TIMEZONE = "timezone";
const FIELD_COUNTRY_ID = "countryId";
const FIELD_STORE_ID = "storeId";
const FIELD_ID = "id";

// Повторяющиеся ключи словаря — тоже в константы (sonarjs/no-duplicate-string).
const KEY_FIELD_NAME = "fields.name";
const KEY_ACTION_ADD = "actions.add";
const KEY_ACTION_CANCEL = "actions.cancel";

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const GRID_CLASS = "grid grid-cols-[220px_300px_1fr] items-start";
const COL_CLASS = "min-h-[420px]";
const COL_BORDERED_CLASS = "min-h-[420px] border-r border-[var(--line)]";
const COL_HEAD_CLASS =
  "flex items-center gap-[var(--space-4)] border-b border-[var(--line-strong)] bg-[var(--surface-3)] px-[var(--space-6)] py-[var(--space-5)] text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-2)] uppercase";
const EMPTY_COL_CLASS =
  "px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]";
const LI_CLASS =
  "text-ink flex items-center gap-[var(--space-4)] border-b border-[var(--line)] px-[var(--space-6)] py-[var(--space-5)] no-underline hover:bg-[var(--surface-2)]";
const LI_SELECTED_CLASS =
  "flex items-center gap-[var(--space-4)] border-b border-[var(--line)] bg-[var(--accent-soft)] px-[var(--space-6)] py-[var(--space-5)] font-medium text-accent no-underline";
const LI_META_CLASS =
  "ml-auto text-[length:var(--fs-meta)] font-normal text-[var(--ink-3)]";
const BTN_GHOST_SM_CLASS =
  "normal-case inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink disabled:cursor-not-allowed disabled:opacity-60";
const BTN_SM_CLASS =
  "normal-case bg-surface text-ink inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium no-underline hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";
const BTN_PRIMARY_SM_CLASS =
  "bg-accent inline-flex h-[var(--control-h-sm)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]";
const CREATE_FORM_CLASS =
  "flex flex-col gap-[var(--space-4)] border-b border-[var(--line)] px-[var(--space-6)] py-[var(--space-5)]";
const FORM_ACTIONS_CLASS = "flex items-center gap-[var(--space-4)]";
const FIELD_CLASS = "flex flex-col gap-[var(--space-3)]";
const FIELD_LABEL_CLASS =
  "text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const INPUT_CLASS =
  "text-ink bg-surface h-[var(--control-h)] w-full rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-lead)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const SELECT_CLASS =
  "text-ink bg-surface h-[var(--control-h)] w-full appearance-none rounded-[var(--r-control)] border border-[var(--line-control)] pr-[var(--space-8)] pl-[var(--space-5)] text-[length:var(--fs-lead)] [background-image:linear-gradient(45deg,transparent_50%,var(--ink-3)_50%),linear-gradient(135deg,var(--ink-3)_50%,transparent_50%)] [background-position:calc(100%-14px)_13px,calc(100%-9px)_13px] [background-repeat:no-repeat] [background-size:5px_5px,5px_5px] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
const TABLE_CLASS =
  "w-full border-collapse text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const TABLE_TH_CLASS =
  "border-b border-[var(--line-strong)] bg-[var(--surface-3)] px-[var(--cell-pad-x)] py-[var(--space-4)] text-left text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-2)] whitespace-nowrap uppercase";
const TABLE_TD_CLASS =
  "border-b border-[var(--line)] px-[var(--cell-pad-x)] py-[var(--space-5)] align-middle";
const TABLE_TD_NUM_CLASS = `${TABLE_TD_CLASS} text-ink text-right font-[family-name:var(--font-num)] text-[length:var(--fs-num)] [font-variant-numeric:tabular-nums]`;
const TABLE_TD_ACTIONS_CLASS = `${TABLE_TD_CLASS} text-right whitespace-nowrap`;
const TABLE_ROW_CLASS = "hover:bg-[var(--surface-2)]";
const TABLE_ROW_SELECTED_CLASS = "bg-[var(--accent-soft)]";
const UNASSIGNED_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";

interface CreateFormProps {
  readonly action: (formData: FormData) => Promise<void>;
  readonly hidden?: ReactNode;
  readonly cancelHref: string;
  readonly t: Translate;
  readonly children: ReactNode;
}

/** Общий каркас трёх форм создания: рамка, скрытые поля и строка кнопок. */
function CreateForm({
  action,
  hidden,
  cancelHref,
  t,
  children,
}: CreateFormProps): ReactElement {
  return (
    <form action={action} className={CREATE_FORM_CLASS}>
      {hidden}
      {children}
      <div className={FORM_ACTIONS_CLASS}>
        <button type="submit" className={BTN_PRIMARY_SM_CLASS}>
          {t(KEY_ACTION_ADD)}
        </button>
        <Link href={cancelHref} className={BTN_GHOST_SM_CLASS}>
          {t(KEY_ACTION_CANCEL)}
        </Link>
      </div>
    </form>
  );
}

/** Поле «Название» повторяется во всех трёх формах создания без изменений. */
function NameField({
  id,
  t,
}: {
  readonly id: string;
  readonly t: Translate;
}): ReactElement {
  return (
    <div className={FIELD_CLASS}>
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {t(KEY_FIELD_NAME)}
      </label>
      <input id={id} name={FIELD_NAME} required className={INPUT_CLASS} />
    </div>
  );
}

interface TreeColumnProps {
  readonly testId: "country-item" | "store-item";
  readonly headLabel: string;
  readonly createHref: string;
  readonly createLabel: string;
  readonly items: readonly TreeItem[];
  readonly metaText: (item: TreeItem) => string;
  readonly emptyLabel: string;
  readonly createForm: ReactNode;
}

/** Колонка «страны» и колонка «пиццерии» устроены одинаково — общая разметка. */
function TreeColumn({
  testId,
  headLabel,
  createHref,
  createLabel,
  items,
  metaText,
  emptyLabel,
  createForm,
}: TreeColumnProps): ReactElement {
  return (
    <div className={COL_BORDERED_CLASS}>
      <div className={COL_HEAD_CLASS}>
        <span>{headLabel}</span>
        <Link href={createHref} className={`${BTN_GHOST_SM_CLASS} ml-auto`}>
          {createLabel}
        </Link>
      </div>
      {createForm}
      {items.length === 0 ? (
        <p className={EMPTY_COL_CLASS}>{emptyLabel}</p>
      ) : (
        items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            data-testid={testId}
            className={item.selected ? LI_SELECTED_CLASS : LI_CLASS}
          >
            <span>{item.name}</span>
            <span className={LI_META_CLASS}>{metaText(item)}</span>
          </Link>
        ))
      )}
    </div>
  );
}

interface StationRowProps {
  readonly station: StationItem;
  readonly countryId: string;
  readonly storeId: string;
  readonly t: Translate;
}

function StationRow({
  station,
  countryId,
  storeId,
  t,
}: StationRowProps): ReactElement {
  const checklistText =
    station.checklists.length === 0
      ? null
      : station.checklists.map((item) => item.title).join(", ");

  return (
    <tr
      data-testid="station-row"
      className={station.selected ? TABLE_ROW_SELECTED_CLASS : TABLE_ROW_CLASS}
    >
      <td className={TABLE_TD_CLASS}>
        <Link href={station.href} className="text-ink no-underline">
          {station.name}
        </Link>
      </td>
      <td className={TABLE_TD_CLASS}>
        {checklistText ?? (
          <span data-testid="station-unassigned" className={UNASSIGNED_CLASS}>
            {t("table.unassigned")}
          </span>
        )}
      </td>
      <td className={TABLE_TD_NUM_CLASS}>{station.code}</td>
      <td className={TABLE_TD_ACTIONS_CLASS}>
        <Link
          href={station.qrHref}
          data-testid="catalog-station-qr"
          className={BTN_GHOST_SM_CLASS}
        >
          {t("actions.qr")}
        </Link>
        <form action={submitReissueCode} className="inline">
          <input type="hidden" name={FIELD_COUNTRY_ID} value={countryId} />
          <input type="hidden" name={FIELD_STORE_ID} value={storeId} />
          <input type="hidden" name={FIELD_ID} value={station.id} />
          <button
            type="submit"
            data-testid="reissue-button"
            className={BTN_GHOST_SM_CLASS}
          >
            {t("actions.reissue")}
          </button>
        </form>
      </td>
    </tr>
  );
}

interface StationsColumnProps {
  readonly model: CatalogModel;
  readonly createForm: ReactNode;
  readonly t: Translate;
}

function StationsColumn({
  model,
  createForm,
  t,
}: StationsColumnProps): ReactElement {
  const { countryId, storeId, stations, storeName } = model;
  const headLabel =
    storeName === null
      ? t("columns.stations")
      : t("columns.stationsOf", { name: storeName });

  return (
    <div className={COL_CLASS}>
      <div className={COL_HEAD_CLASS}>
        <span>{headLabel}</span>
        <Link
          href={model.hrefs.createStation}
          className={`${BTN_SM_CLASS} ml-auto`}
        >
          {t("add.station")}
        </Link>
      </div>
      {createForm}
      {stations.length > 0 && storeId !== null && countryId !== null ? (
        <table className={TABLE_CLASS}>
          <thead>
            <tr>
              <th className={TABLE_TH_CLASS}>{t("table.station")}</th>
              <th className={TABLE_TH_CLASS}>{t("table.checklists")}</th>
              <th className={TABLE_TH_CLASS}>{t("table.code")}</th>
              <th className={TABLE_TH_CLASS} />
            </tr>
          </thead>
          <tbody>
            {stations.map((station) => (
              <StationRow
                key={station.id}
                station={station}
                countryId={countryId}
                storeId={storeId}
                t={t}
              />
            ))}
          </tbody>
        </table>
      ) : (
        <p className={EMPTY_COL_CLASS}>{t("empty.stations")}</p>
      )}
    </div>
  );
}

export async function CatalogTree({
  model,
}: {
  readonly model: CatalogModel;
}): Promise<ReactElement> {
  const t = await getTranslations("catalog");
  const { countryId, storeId } = model;

  const countryForm =
    model.create === "country" ? (
      <CreateForm
        action={submitCreateCountry}
        cancelHref={model.hrefs.cancel}
        t={t}
      >
        <NameField id="new-country-name" t={t} />
        <div className={FIELD_CLASS}>
          <label htmlFor="new-country-locale" className={FIELD_LABEL_CLASS}>
            {t("fields.locale")}
          </label>
          <select
            id="new-country-locale"
            name={FIELD_LOCALE}
            defaultValue="ru"
            className={SELECT_CLASS}
          >
            <option value="ru">ru</option>
            <option value="en">en</option>
          </select>
        </div>
      </CreateForm>
    ) : null;

  const storeForm =
    model.create === "store" && countryId !== null ? (
      <CreateForm
        action={submitCreateStore}
        cancelHref={model.hrefs.cancel}
        t={t}
        hidden={
          <input type="hidden" name={FIELD_COUNTRY_ID} value={countryId} />
        }
      >
        <NameField id="new-store-name" t={t} />
        <div className={FIELD_CLASS}>
          <label htmlFor="new-store-timezone" className={FIELD_LABEL_CLASS}>
            {t("fields.timezone")}
          </label>
          <select
            id="new-store-timezone"
            name={FIELD_TIMEZONE}
            required
            className={SELECT_CLASS}
          >
            {model.timezones.map((zone) => (
              <option key={zone.name} value={zone.name}>
                {zone.name} ({zone.offset})
              </option>
            ))}
          </select>
        </div>
      </CreateForm>
    ) : null;

  const stationForm =
    model.create === "station" && countryId !== null && storeId !== null ? (
      <CreateForm
        action={submitCreateStation}
        cancelHref={model.hrefs.cancel}
        t={t}
        hidden={
          <>
            <input type="hidden" name={FIELD_COUNTRY_ID} value={countryId} />
            <input type="hidden" name={FIELD_STORE_ID} value={storeId} />
          </>
        }
      >
        <NameField id="new-station-name" t={t} />
      </CreateForm>
    ) : null;

  return (
    <div data-testid="catalog-tree" className={CARD_CLASS}>
      <div className={GRID_CLASS}>
        <TreeColumn
          testId="country-item"
          headLabel={t("columns.countries")}
          createHref={model.hrefs.createCountry}
          createLabel={t("add.country")}
          items={model.countries}
          metaText={(item) => String(item.count)}
          emptyLabel={t("empty.countries")}
          createForm={countryForm}
        />
        <TreeColumn
          testId="store-item"
          headLabel={t("columns.stores")}
          createHref={model.hrefs.createStore}
          createLabel={t("add.store")}
          items={model.stores}
          metaText={(item) => t("counts.stations", { count: item.count })}
          emptyLabel={t("empty.stores")}
          createForm={storeForm}
        />
        <StationsColumn model={model} createForm={stationForm} t={t} />
      </div>
    </div>
  );
}
