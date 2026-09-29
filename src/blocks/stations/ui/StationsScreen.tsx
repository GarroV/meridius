import { getLocale, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { formActionPath } from "@/blocks/core/base-path";
import { AdminPage } from "@/blocks/core/ui/AdminPage";
import { listTemplates } from "@/blocks/editor/templates";
import type { LocalizedText } from "@/blocks/data";

import { submitCopyToStations } from "./actions";
import { ROLLOUT_FORM_ID, STICKERS_PATH } from "./view";

/**
 * Раздел «Станции» — единственное место, где живёт всё про станцию (D151).
 *
 * До него привязка была разложена по трём местам, и ни одно не называлось привязкой:
 * чек-лист станции выбирался в справочнике, станция чек-листа — в редакторе, пин
 * планшета выпускался с карточки чек-листа, а раздел «Устройства» умел только смотреть.
 * Два входа противоречили друг другу — из одного привязывали чек-лист к станции, из
 * другого станцию к чек-листу, — и владелец сформулировал итог точно: «я не вижу как
 * привязать».
 *
 * С D163 раздел — мастер-деталь: станции сети, счёт дырок и фильтр по ним стоят в
 * колонке слева (`StationsRail`, разметка сегмента), а этот экран — рабочая зона, пока
 * станция не выбрана: зачем раздел, куда нажать, раскатка шаблона и печать наклеек на
 * отмеченные в колонке станции. Галочки колонки — поля формы выбора отсюда (атрибут `form`).
 */

const INTRO_CLASS =
  "rounded-[var(--r-block)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";
const PICK_CLASS =
  "bg-surface flex flex-col gap-[var(--space-3)] rounded-[var(--r-block)] border border-[var(--line-strong)] px-[var(--space-7)] py-[var(--space-6)] shadow-[var(--sh-xs)]";
const PICK_TITLE_CLASS =
  "m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold text-ink";
const ROLLOUT_CLASS =
  "bg-surface flex flex-wrap items-center gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line-strong)] px-[var(--space-7)] py-[var(--space-5)] shadow-[var(--sh-xs)]";
const SELECT_CLASS =
  "bg-surface text-ink h-[var(--control-h)] min-w-[220px] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-4)] text-[length:var(--fs-body)]";
const BUTTON_CLASS =
  "bg-surface text-ink flex h-[var(--control-h)] items-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-control-2)]";
const META_CLASS =
  "m-0 text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";

/** То же правило выбора языка, что на карточке станции: пустой перевод — не перевод. */
function templateTitle(title: LocalizedText, locale: string): string {
  const own = title[locale];
  if (own !== undefined && own !== "") return own;
  return title["en"] ?? "";
}

export interface StationsScreenProps {
  /**
   * Шаблон, с которым пришли из раздела «Шаблоны» («Взять к себе», T309). Выбран в
   * раскатке заранее: иначе человек, нажавший «взять этот», раскатал бы первый в списке.
   * Неизвестный — выбор по умолчанию, а не пустой список.
   */
  readonly template?: string | undefined;
}

export async function StationsScreen({
  template,
}: StationsScreenProps): Promise<ReactElement> {
  const t = await getTranslations("stations");
  const locale = await getLocale();
  const templates = await listTemplates();
  const chosenTemplate =
    templates.find((row) => row.id === template)?.id ?? templates[0]?.id;

  return (
    <AdminPage
      testId="stations-home"
      breadcrumb={t("breadcrumb")}
      title={t("title")}
      topbarAction={null}
    >
      {/* D152: раздел объясняет себя сам, строкой цели на самом экране. */}
      <p className={INTRO_CLASS}>{t("intro")}</p>

      <div className={PICK_CLASS} data-testid="stations-pick">
        <p className={PICK_TITLE_CLASS}>{t("rail.pickTitle")}</p>
        <p className={META_CLASS}>{t("rail.pickHint")}</p>
      </div>

      {/*
        Форма выбора стоит всегда, даже без шаблонов: галочки колонки ссылаются на неё
        атрибутом `form`, и печать наклеек пачкой (T311) не должна зависеть от того,
        есть ли что раскатывать. Две кнопки — два пути одних и тех же галочек: раскатка
        уходит серверным действием, печать — обычным GET на лист наклеек, чтобы выбор
        лёг в адрес. Приставку базового пути атрибуту `formAction` ставит
        `formActionPath`: Next его не трогает.
      */}
      <form
        id={ROLLOUT_FORM_ID}
        action={submitCopyToStations}
        className={ROLLOUT_CLASS}
        data-testid="rollout-form"
      >
        {templates.length === 0 ? (
          <span className={META_CLASS} data-testid="no-templates">
            {t("rollout.noTemplates")}
          </span>
        ) : (
          <>
            <label className={META_CLASS} htmlFor="rollout-template">
              {t("rollout.label")}
            </label>
            <select
              id="rollout-template"
              name="templateId"
              className={SELECT_CLASS}
              defaultValue={chosenTemplate}
            >
              {templates.map((row) => (
                <option key={row.id} value={row.id}>
                  {templateTitle(row.title, locale)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className={BUTTON_CLASS}
              data-testid="rollout-submit"
            >
              {t("rollout.action")}
            </button>
          </>
        )}
        <button
          type="submit"
          formAction={formActionPath(STICKERS_PATH)}
          formMethod="get"
          className={BUTTON_CLASS}
          data-testid="stickers-submit"
        >
          {t("stickers.action")}
        </button>
        <span className={META_CLASS}>{t("rollout.hint")}</span>
      </form>
    </AdminPage>
  );
}
