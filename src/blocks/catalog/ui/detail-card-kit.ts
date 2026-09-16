import type { getTranslations } from "next-intl/server";

/**
 * Общая обвязка трёх карточек правки (страна / пиццерия / станция): классы
 * оформления, нужные больше чем одной карточке, имена полей форм — те же
 * строки, что в `actions.ts` (там они приватные, потому что файл с
 * `"use server"` умеет экспортировать только асинхронные функции), ключи
 * словаря и тип переводчика. Сами карточки лежат рядом по файлу на сущность.
 */

export type Translate = Awaited<ReturnType<typeof getTranslations>>;

// Имена полей форм — те же строки, что в actions.ts (там они приватные).
export const FIELD_NAME = "name";
export const FIELD_LOCALE = "locale";
export const FIELD_TIMEZONE = "timezone";
export const FIELD_ID = "id";
export const FIELD_COUNTRY_ID = "countryId";
export const FIELD_STORE_ID = "storeId";
export const FIELD_STATION_ID = "stationId";
export const FIELD_CHECKLIST_ID = "checklistId";

// Повторяющиеся ключи словаря — тоже в константы (sonarjs/no-duplicate-string).
export const KEY_FIELD_NAME = "fields.name";
export const KEY_ACTION_SAVE = "actions.save";

export const DETAIL_CARD_TEST_ID = "detail-card";

export const CARD_CLASS =
  "bg-surface max-w-[880px] rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
export const CARD_HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
export const CARD_BODY_CLASS =
  "flex flex-col gap-[var(--space-6)] p-[var(--space-7)]";
export const CARD_TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
export const ROW_CLASS = "flex gap-[var(--space-6)] [&>*]:min-w-0 [&>*]:flex-1";
export const FIELD_CLASS = "flex flex-col gap-[var(--space-3)]";
export const FIELD_LABEL_CLASS =
  "text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
export const INPUT_CLASS =
  "text-ink bg-surface h-[var(--control-h)] w-full rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-lead)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none";
export const SELECT_CLASS =
  "text-ink bg-surface h-[var(--control-h)] w-full appearance-none rounded-[var(--r-control)] border border-[var(--line-control)] pr-[var(--space-8)] pl-[var(--space-5)] text-[length:var(--fs-lead)] [background-image:linear-gradient(45deg,transparent_50%,var(--ink-3)_50%),linear-gradient(135deg,var(--ink-3)_50%,transparent_50%)] [background-position:calc(100%-14px)_13px,calc(100%-9px)_13px] [background-repeat:no-repeat] [background-size:5px_5px,5px_5px] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-soft)] focus:outline-none disabled:opacity-60";
// Значение, которое эта версия не даёт править (страна пиццерии — T117): та же коробка,
// что у INPUT_CLASS, но без фокуса и стрелки выпадающего списка — оно не элемент формы.
// Раньше на этом месте был `<select disabled>`, а серый неактивный контрол читается как
// «сломано» или «нет прав» — тот же класс дефекта, что кнопки QR (T107), пункты меню
// кабинета и «Открыть блок» редактора. Здесь функциональности переноса нет и в этой
// версии не будет, поэтому решение — не притворяться контролом, а честно показать текст.
export const FIELD_VALUE_CLASS =
  "text-ink bg-surface flex h-[var(--control-h)] w-full items-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-lead)]";
// Отказ, названный рядом с самим полем, а не только полосой наверху экрана (T102):
// методист смотрит на поле, которое правит. Геометрия — подписи под полем из эталона
// (`.field__hint`: `--fs-meta`, зазор поля `--space-3`), а не полосы `.notice--err`:
// полоса — блок наверху экрана, со своей рамкой и подложкой, и вторая такая же под
// каждым полем превратила бы карточку в лоскуты. Отличает от обычной подписи только
// тон: `--err` вместо `--ink-3`. `m-0` — у абзаца иначе остаётся браузерный отступ,
// и подпись отрывается от своего поля (та же правка уже сделана в форме входа).
export const FIELD_NOTICE_CLASS = "text-err m-0 text-[length:var(--fs-meta)]";
export const INLINE_CLASS = "flex items-center gap-[var(--space-5)]";
export const BTN_GHOST_DANGER_CLASS =
  "text-err inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-transparent bg-transparent px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--err-line)] hover:bg-[var(--err-soft)]";
export const BTN_PRIMARY_CLASS =
  "bg-accent inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]";
