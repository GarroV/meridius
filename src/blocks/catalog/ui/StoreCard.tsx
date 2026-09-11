import type { ReactElement } from "react";

import { submitDeleteStore, submitUpdateStore } from "./actions";
import {
  BTN_GHOST_DANGER_CLASS,
  BTN_PRIMARY_CLASS,
  CARD_BODY_CLASS,
  CARD_CLASS,
  CARD_HEAD_CLASS,
  CARD_TITLE_CLASS,
  DETAIL_CARD_TEST_ID,
  FIELD_CLASS,
  FIELD_COUNTRY_ID,
  FIELD_ID,
  FIELD_LABEL_CLASS,
  FIELD_NAME,
  FIELD_TIMEZONE,
  FIELD_VALUE_CLASS,
  INLINE_CLASS,
  INPUT_CLASS,
  KEY_ACTION_SAVE,
  KEY_FIELD_NAME,
  ROW_CLASS,
  SELECT_CLASS,
  type Translate,
} from "./detail-card-kit";
import type { StoreDetail } from "./model";
import type { TimezoneOption } from "../timezone";

const STORE_FORM_ID = "store-edit-form";

export function StoreCard({
  store,
  countryId,
  timezones,
  t,
}: {
  readonly store: StoreDetail;
  readonly countryId: string;
  readonly timezones: readonly TimezoneOption[];
  readonly t: Translate;
}): ReactElement {
  return (
    <div data-testid={DETAIL_CARD_TEST_ID} className={CARD_CLASS}>
      <div className={CARD_HEAD_CLASS}>
        <h2 className={CARD_TITLE_CLASS}>
          {t("card.storeTitle", { name: store.name })}
        </h2>
      </div>
      <div className={CARD_BODY_CLASS}>
        <form id={STORE_FORM_ID} action={submitUpdateStore}>
          <input type="hidden" name={FIELD_ID} value={store.id} />
          <input type="hidden" name={FIELD_COUNTRY_ID} value={countryId} />
        </form>
        <div className={ROW_CLASS}>
          <div className={FIELD_CLASS}>
            <label htmlFor="store-name" className={FIELD_LABEL_CLASS}>
              {t(KEY_FIELD_NAME)}
            </label>
            <input
              id="store-name"
              form={STORE_FORM_ID}
              name={FIELD_NAME}
              defaultValue={store.name}
              className={INPUT_CLASS}
            />
          </div>
          <div className={FIELD_CLASS}>
            <span id="store-country-label" className={FIELD_LABEL_CLASS}>
              {t("fields.country")}
            </span>
            {/* Перенос пиццерии между странами эта версия не делает — значение только
                для чтения (T117). Не элемент формы: обычный текст, а не `<select disabled>`,
                который читался как «сломано» или «нет прав». */}
            <p
              id="store-country"
              aria-labelledby="store-country-label"
              data-testid="store-country-value"
              className={FIELD_VALUE_CLASS}
            >
              {store.countryName}
            </p>
          </div>
          <div className={FIELD_CLASS}>
            <label htmlFor="store-timezone" className={FIELD_LABEL_CLASS}>
              {t("fields.timezone")}
            </label>
            <select
              id="store-timezone"
              form={STORE_FORM_ID}
              name={FIELD_TIMEZONE}
              defaultValue={store.timezone}
              className={SELECT_CLASS}
            >
              {timezones.map((zone) => (
                <option key={zone.name} value={zone.name}>
                  {zone.name} ({zone.offset})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={INLINE_CLASS}>
          <button
            type="submit"
            form={STORE_FORM_ID}
            className={BTN_PRIMARY_CLASS}
          >
            {t(KEY_ACTION_SAVE)}
          </button>
          <form action={submitDeleteStore} className="ml-auto">
            <input type="hidden" name={FIELD_ID} value={store.id} />
            <input type="hidden" name={FIELD_COUNTRY_ID} value={countryId} />
            <button type="submit" className={BTN_GHOST_DANGER_CLASS}>
              {t("actions.deleteStore")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
