import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { QrStoreOption } from "./model";

/**
 * Карточка выбора пиццерии — состояния, которого нет в эталоне: лист
 * печатается по одной пиццерии, а без неё в адресе показывать нечего, кроме
 * выбора. Каждый пункт ведёт на тот же адрес листа с проставленным `?store=…`
 * (`QrStoreOption.href` уже собран в `build-model.ts` функцией `qrHref`).
 */

const CARD_CLASS =
  "bg-surface max-w-[880px] rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const CARD_HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const CARD_TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const HINT_CLASS =
  "px-[var(--space-7)] pt-[var(--space-6)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const LIST_CLASS = "flex flex-col pb-[var(--space-4)]";
const ITEM_CLASS =
  "text-ink flex items-center gap-[var(--space-4)] border-t border-[var(--line)] px-[var(--space-7)] py-[var(--space-5)] no-underline first:border-t-0 hover:bg-[var(--surface-2)]";
const ITEM_META_CLASS =
  "ml-auto text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const EMPTY_CLASS =
  "flex flex-col items-center gap-[var(--space-5)] px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]";

export interface StorePickerProps {
  readonly stores: readonly QrStoreOption[];
}

export async function StorePicker({
  stores,
}: StorePickerProps): Promise<ReactElement> {
  const t = await getTranslations("qr");

  return (
    <div data-testid="qr-store-picker" className={CARD_CLASS}>
      <div className={CARD_HEAD_CLASS}>
        <h2 className={CARD_TITLE_CLASS}>{t("picker.title")}</h2>
      </div>
      <p className={HINT_CLASS}>{t("picker.hint")}</p>
      {stores.length === 0 ? (
        <p className={EMPTY_CLASS}>{t("picker.empty")}</p>
      ) : (
        <div className={LIST_CLASS}>
          {stores.map((store) => (
            <Link key={store.id} href={store.href} className={ITEM_CLASS}>
              <span>{`${store.countryName} · ${store.name}`}</span>
              <span className={ITEM_META_CLASS}>
                {t("picker.stations", { count: store.stationCount })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
