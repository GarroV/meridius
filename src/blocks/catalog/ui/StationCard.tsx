import type { ReactElement } from "react";

import type { Locale } from "@/blocks/core/locale";

import {
  submitAssignChecklist,
  submitDeleteStation,
  submitDetachChecklist,
  submitUpdateStation,
} from "./actions";
import {
  BTN_GHOST_DANGER_CLASS,
  BTN_PRIMARY_CLASS,
  CARD_BODY_CLASS,
  CARD_CLASS,
  CARD_HEAD_CLASS,
  CARD_TITLE_CLASS,
  DETAIL_CARD_TEST_ID,
  FIELD_CHECKLIST_ID,
  FIELD_CLASS,
  FIELD_COUNTRY_ID,
  FIELD_ID,
  FIELD_LABEL_CLASS,
  FIELD_NAME,
  FIELD_STATION_ID,
  FIELD_STORE_ID,
  INLINE_CLASS,
  INPUT_CLASS,
  KEY_ACTION_SAVE,
  KEY_FIELD_NAME,
  ROW_CLASS,
  SELECT_CLASS,
  type Translate,
} from "./detail-card-kit";
import type { StationChecklistItem, StationDetail } from "./model";

const STATION_FORM_ID = "station-edit-form";

const FIELD_HINT_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const BTN_CLASS =
  "text-ink bg-surface inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";
const BTN_GHOST_CLASS =
  "inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-2)] no-underline hover:bg-[var(--surface-3)] hover:text-ink";
const SECTION_CLASS =
  "flex flex-col gap-[var(--space-4)] border-t border-[var(--line)] pt-[var(--space-6)]";
const CHECKLIST_LIST_CLASS = "m-0 flex list-none flex-col p-0";
const CHECKLIST_ITEM_CLASS =
  "flex items-center gap-[var(--space-4)] border-b border-[var(--line)] py-[var(--space-3)]";
const CODE_ROW_CLASS = "m-0 flex items-center gap-[var(--space-5)]";
const CODE_VALUE_CLASS =
  "text-ink font-[family-name:var(--font-num)] text-[length:var(--fs-lead)] [font-variant-numeric:tabular-nums]";
const NOTICE_WARN_CLASS =
  "flex gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--warn-line)] bg-[var(--warn-soft)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)] text-[var(--warn-ink)]";

interface ChecklistRowProps {
  readonly checklist: StationChecklistItem;
  readonly countryId: string;
  readonly storeId: string;
  readonly stationId: string;
  readonly t: Translate;
}

// Строка привязанного чек-листа — своя функция ради отступа: внутри `.map`
// те же четыре скрытых поля не помещались в строку и разъезжались построчно.
function ChecklistRow({
  checklist,
  countryId,
  storeId,
  stationId,
  t,
}: ChecklistRowProps): ReactElement {
  return (
    <li className={CHECKLIST_ITEM_CLASS}>
      <span>{checklist.title}</span>
      <form action={submitDetachChecklist} className="ml-auto">
        <input type="hidden" name={FIELD_COUNTRY_ID} value={countryId} />
        <input type="hidden" name={FIELD_STORE_ID} value={storeId} />
        <input type="hidden" name={FIELD_STATION_ID} value={stationId} />
        <input type="hidden" name={FIELD_CHECKLIST_ID} value={checklist.id} />
        <button
          type="submit"
          className={`${BTN_GHOST_CLASS} text-[length:var(--fs-dense)]`}
        >
          {t("actions.detach")}
        </button>
      </form>
    </li>
  );
}

export function StationCard({
  station,
  countryId,
  storeId,
  stationId,
  freeChecklists,
  locale,
  t,
}: {
  readonly station: StationDetail;
  readonly countryId: string;
  readonly storeId: string;
  readonly stationId: string;
  readonly freeChecklists: readonly StationChecklistItem[];
  readonly locale: Locale;
  readonly t: Translate;
}): ReactElement {
  const issuedAt = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(new Date(station.codeIssuedAt));

  return (
    <div data-testid={DETAIL_CARD_TEST_ID} className={CARD_CLASS}>
      <div className={CARD_HEAD_CLASS}>
        <h2 className={CARD_TITLE_CLASS}>
          {t("card.stationTitle", { name: station.name })}
        </h2>
      </div>
      <div className={CARD_BODY_CLASS}>
        <form id={STATION_FORM_ID} action={submitUpdateStation}>
          <input type="hidden" name={FIELD_ID} value={station.id} />
          <input type="hidden" name={FIELD_COUNTRY_ID} value={countryId} />
          <input type="hidden" name={FIELD_STORE_ID} value={storeId} />
        </form>
        <div className={ROW_CLASS}>
          <div className={FIELD_CLASS}>
            <label htmlFor="station-name" className={FIELD_LABEL_CLASS}>
              {t(KEY_FIELD_NAME)}
            </label>
            <input
              id="station-name"
              form={STATION_FORM_ID}
              name={FIELD_NAME}
              defaultValue={station.name}
              className={INPUT_CLASS}
            />
          </div>
        </div>
        <div className={INLINE_CLASS}>
          <button
            type="submit"
            form={STATION_FORM_ID}
            className={BTN_PRIMARY_CLASS}
          >
            {t(KEY_ACTION_SAVE)}
          </button>
          <form action={submitDeleteStation} className="ml-auto">
            <input type="hidden" name={FIELD_ID} value={station.id} />
            <input type="hidden" name={FIELD_COUNTRY_ID} value={countryId} />
            <input type="hidden" name={FIELD_STORE_ID} value={storeId} />
            <button type="submit" className={BTN_GHOST_DANGER_CLASS}>
              {t("actions.deleteStation")}
            </button>
          </form>
        </div>

        <div className={SECTION_CLASS}>
          <h3 className={FIELD_LABEL_CLASS}>{t("card.stationChecklists")}</h3>
          {station.checklists.length === 0 ? (
            <p className={NOTICE_WARN_CLASS}>{t("assign.none")}</p>
          ) : (
            <ul className={CHECKLIST_LIST_CLASS}>
              {station.checklists.map((checklist) => (
                <ChecklistRow
                  key={checklist.id}
                  checklist={checklist}
                  countryId={countryId}
                  storeId={storeId}
                  stationId={stationId}
                  t={t}
                />
              ))}
            </ul>
          )}

          {freeChecklists.length === 0 ? (
            <p className={FIELD_HINT_CLASS}>{t("assign.noFree")}</p>
          ) : (
            <form action={submitAssignChecklist} className={INLINE_CLASS}>
              <input type="hidden" name={FIELD_COUNTRY_ID} value={countryId} />
              <input type="hidden" name={FIELD_STORE_ID} value={storeId} />
              <input type="hidden" name={FIELD_STATION_ID} value={stationId} />
              <label htmlFor="assign-checklist" className="sr-only">
                {t("assign.selectLabel")}
              </label>
              <select
                id="assign-checklist"
                name={FIELD_CHECKLIST_ID}
                required
                className={SELECT_CLASS}
              >
                {freeChecklists.map((checklist) => (
                  <option key={checklist.id} value={checklist.id}>
                    {checklist.title}
                  </option>
                ))}
              </select>
              <button type="submit" className={BTN_CLASS}>
                {t("actions.assign")}
              </button>
            </form>
          )}
        </div>

        <div className={SECTION_CLASS}>
          <h3 className={FIELD_LABEL_CLASS}>{t("card.qrCode")}</h3>
          <p className={CODE_ROW_CLASS}>
            <span className={CODE_VALUE_CLASS}>{station.code}</span>
            <span className={FIELD_HINT_CLASS}>
              {t("card.issuedAt", { date: issuedAt })}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
