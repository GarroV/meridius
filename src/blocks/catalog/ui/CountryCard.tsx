import type { ReactElement } from "react";

import { LOCALES } from "@/blocks/core/locale";

import { submitDeleteCountry, submitUpdateCountry } from "./actions";
import {
  BTN_GHOST_DANGER_CLASS,
  BTN_PRIMARY_CLASS,
  CARD_BODY_CLASS,
  CARD_CLASS,
  CARD_HEAD_CLASS,
  CARD_TITLE_CLASS,
  DETAIL_CARD_TEST_ID,
  FIELD_CLASS,
  FIELD_ID,
  FIELD_LABEL_CLASS,
  FIELD_LOCALE,
  FIELD_NAME,
  INLINE_CLASS,
  INPUT_CLASS,
  KEY_ACTION_SAVE,
  KEY_FIELD_NAME,
  ROW_CLASS,
  SELECT_CLASS,
  type Translate,
} from "./detail-card-kit";
import type { CountryDetail } from "./model";

const COUNTRY_FORM_ID = "country-edit-form";

export function CountryCard({
  country,
  t,
}: {
  readonly country: CountryDetail;
  readonly t: Translate;
}): ReactElement {
  return (
    <div data-testid={DETAIL_CARD_TEST_ID} className={CARD_CLASS}>
      <div className={CARD_HEAD_CLASS}>
        <h2 className={CARD_TITLE_CLASS}>
          {t("card.countryTitle", { name: country.name })}
        </h2>
      </div>
      <div className={CARD_BODY_CLASS}>
        <form id={COUNTRY_FORM_ID} action={submitUpdateCountry}>
          <input type="hidden" name={FIELD_ID} value={country.id} />
        </form>
        <div className={ROW_CLASS}>
          <div className={FIELD_CLASS}>
            <label htmlFor="country-name" className={FIELD_LABEL_CLASS}>
              {t(KEY_FIELD_NAME)}
            </label>
            <input
              id="country-name"
              form={COUNTRY_FORM_ID}
              name={FIELD_NAME}
              defaultValue={country.name}
              className={INPUT_CLASS}
            />
          </div>
          <div className={FIELD_CLASS}>
            <label htmlFor="country-locale" className={FIELD_LABEL_CLASS}>
              {t("fields.locale")}
            </label>
            <select
              id="country-locale"
              form={COUNTRY_FORM_ID}
              name={FIELD_LOCALE}
              defaultValue={country.locale}
              className={SELECT_CLASS}
            >
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={INLINE_CLASS}>
          <button
            type="submit"
            form={COUNTRY_FORM_ID}
            className={BTN_PRIMARY_CLASS}
          >
            {t(KEY_ACTION_SAVE)}
          </button>
          <form action={submitDeleteCountry} className="ml-auto">
            <input type="hidden" name={FIELD_ID} value={country.id} />
            <button type="submit" className={BTN_GHOST_DANGER_CLASS}>
              {t("actions.deleteCountry")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
