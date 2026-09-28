import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { listUnassignedChecklists } from "@/blocks/catalog";
import type { LocalizedText } from "@/blocks/data";
import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { asLocale } from "@/blocks/core/locale";
import { AdminPage } from "@/blocks/core/ui/AdminPage";
import { PairTabletCard } from "@/blocks/device/ui/PairTabletCard";
import { UnlinkButton } from "@/blocks/device/ui/UnlinkButton";

import { getStationDetail } from "../detail";
import {
  submitAssignChecklist,
  submitDetachChecklist,
  submitReissueCode,
} from "./actions";
import { stationHref } from "./view";

/**
 * Карточка станции — место, где чек-лист, наклейка и планшет наконец встречаются.
 *
 * До неё привязка жила в трёх разделах: чек-лист станции выбирался в справочнике,
 * станция чек-листа — в редакторе, пин планшета выпускался с карточки чек-листа, а
 * «Устройства» умели только смотреть. Человек, привязывавший станцию, открывал три
 * экрана подряд, и ни один из них не назывался привязкой (D151).
 *
 * Инструкция стоит здесь же, а не в справке и не подсказкой (D152). Три факта в ней —
 * не украшение: каждый из них уже приводил к тому, что продукт считали сломанным.
 * Код живёт пять минут; перевыпуск наклейки привязку планшета не трогает; планшет
 * остаётся привязанным до отвязки, перезагрузка её не снимает.
 *
 * С D163 карточка — рабочая зона справа от колонки станций: меню и список рисует
 * разметка раздела (`StationsWorkspace`), а карточка — только правую часть.
 */

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const CARD_HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const CARD_TITLE_CLASS =
  "text-[length:var(--fs-dense)] font-semibold tracking-[var(--tracking-micro)] uppercase";
const CARD_BODY_CLASS =
  "flex flex-col gap-[var(--space-5)] px-[var(--space-7)] py-[var(--space-6)]";
const ROW_CLASS =
  "flex flex-wrap items-center gap-x-[var(--space-6)] gap-y-[var(--space-3)]";
const META_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const GAP_CLASS =
  "text-err rounded-[var(--r-mark)] bg-[var(--err-soft)] px-[var(--space-3)] py-[var(--space-1)] text-[length:var(--fs-meta)] font-medium";
const BUTTON_CLASS =
  "bg-surface text-ink flex h-[var(--control-h)] items-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--line-control-2)]";
const SELECT_CLASS =
  "bg-surface text-ink h-[var(--control-h)] min-w-[220px] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-4)] text-[length:var(--fs-body)]";
const CODE_CLASS =
  "font-[family-name:var(--font-mono,monospace)] text-[length:var(--fs-title)] tracking-[0.08em]";
const STEPS_CLASS =
  "flex list-decimal flex-col gap-[var(--space-3)] pl-[var(--space-7)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const FACTS_CLASS =
  "flex flex-col gap-[var(--space-3)] rounded-[var(--r-control)] bg-[var(--surface-2)] px-[var(--space-6)] py-[var(--space-5)] text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-2)]";

/**
 * Название чек-листа на языке кабинета. Пустая строка на месте перевода — не то же
 * самое, что его отсутствие: чек-лист, заведённый в английском окне, имеет русский
 * ключ с пустым значением, и без запасного варианта строка в списке была бы пустой.
 */
function localized(text: LocalizedText, locale: string): string {
  // Явной развилкой, а не через `||`: пустая строка на месте перевода — это ОТСУТСТВИЕ
  // перевода, и запасной вариант ей нужен. `??` сюда не годится (пустая строка не
  // nullish), а `||` запрещён линтом как менее безопасный — так что условие пишется словами.
  const own = text[locale];
  if (own !== undefined && own !== "") return own;
  return text["en"] ?? "";
}

function Card({
  testId,
  title,
  children,
}: {
  readonly testId: string;
  readonly title: string;
  readonly children: ReactElement | readonly ReactElement[];
}): ReactElement {
  return (
    <section className={CARD_CLASS} data-testid={testId}>
      <div className={CARD_HEAD_CLASS}>
        <h2 className={CARD_TITLE_CLASS}>{title}</h2>
      </div>
      <div className={CARD_BODY_CLASS}>{children}</div>
    </section>
  );
}

export interface StationScreenProps {
  readonly stationId: string;
  /** Отвязка какого планшета сейчас подтверждается. Решает адрес, а не состояние. */
  readonly confirmUnlink?: string | undefined;
}

export async function StationScreen({
  stationId,
  confirmUnlink,
}: StationScreenProps): Promise<ReactElement | null> {
  const station = await getStationDetail(stationId);
  if (station === null) return null;

  const t = await getTranslations("stations");
  const tDevice = await getTranslations("device");
  const tCatalog = await getTranslations("catalog");
  const locale = asLocale(await getLocale());
  const free = await listUnassignedChecklists();
  const here = stationHref(station.id);

  return (
    <AdminPage
      testId="station-screen"
      // Крошка — просто текст: список станций стоит рядом, в колонке слева (D163), и
      // синяя ссылка «Станции» над заголовком вела бы туда, где человек уже есть.
      breadcrumb={`${t("title")} · ${station.countryName} · ${station.storeName}`}
      title={station.name}
      topbarAction={null}
      narrow
    >
      <Card testId="station-checklist-card" title={t("card.checklist")}>
        {station.checklists.length === 0 ? (
          <p className={ROW_CLASS}>
            <span className={GAP_CLASS}>{t("gaps.noChecklist")}</span>
            <span className={META_CLASS}>{t("card.noChecklistWhy")}</span>
          </p>
        ) : (
          <>
            {station.checklists.map((checklist) => (
              <form
                key={checklist.id}
                action={submitDetachChecklist}
                className={ROW_CLASS}
                data-testid="attached-checklist"
              >
                <input type="hidden" name="stationId" value={station.id} />
                <input type="hidden" name="checklistId" value={checklist.id} />
                <span className="font-medium">
                  {localized(checklist.title, locale)}
                </span>
                <button
                  type="submit"
                  className={BUTTON_CLASS}
                  data-testid="detach-checklist"
                >
                  {t("card.detach")}
                </button>
              </form>
            ))}
          </>
        )}

        {free.length === 0 ? (
          <p className={META_CLASS}>{t("card.nothingToAttach")}</p>
        ) : (
          <form
            action={submitAssignChecklist}
            className={ROW_CLASS}
            data-testid="attach-checklist-form"
          >
            <input type="hidden" name="stationId" value={station.id} />
            <label className={META_CLASS} htmlFor="attach-checklist">
              {t("card.attachLabel")}
            </label>
            <select
              id="attach-checklist"
              name="checklistId"
              className={SELECT_CLASS}
              defaultValue={free[0]?.id}
            >
              {free.map((checklist) => (
                <option key={checklist.id} value={checklist.id}>
                  {localized(checklist.title, locale)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className={BUTTON_CLASS}
              data-testid="attach-checklist"
            >
              {t("card.attach")}
            </button>
          </form>
        )}
      </Card>

      <Card testId="station-sticker-card" title={t("card.sticker")}>
        <p className={META_CLASS}>{t("card.stickerWhat")}</p>
        <p className={ROW_CLASS}>
          <span className={CODE_CLASS} data-testid="station-code">
            {station.code}
          </span>
          <Link
            href={`${ADMIN_SECTIONS.qr.path}?store=${station.storeId}`}
            className={BUTTON_CLASS}
            data-testid="print-sticker"
          >
            {t("card.print")}
          </Link>
        </p>
        <form action={submitReissueCode} className={ROW_CLASS}>
          <input type="hidden" name="stationId" value={station.id} />
          <button
            type="submit"
            className={BUTTON_CLASS}
            data-testid="reissue-code"
          >
            {t("card.reissue")}
          </button>
          <span className={META_CLASS}>{t("card.reissueWarning")}</span>
        </form>
      </Card>

      <Card testId="station-tablet-card" title={t("card.tablet")}>
        <p className={META_CLASS}>{t("card.tabletWhat")}</p>

        {station.tablets.length === 0 ? (
          <p className={META_CLASS} data-testid="no-tablet">
            {t("card.noTablet")}
          </p>
        ) : (
          <>
            {station.tablets.map((tablet) => (
              <div
                key={tablet.id}
                className={ROW_CLASS}
                data-testid="paired-tablet"
              >
                <span className="font-medium">
                  {t("card.pairedAt", { at: tablet.pairedAt })}
                </span>
                <UnlinkButton
                  deviceId={tablet.id}
                  open={confirmUnlink === tablet.id}
                  screenHref={here}
                  // Подписи те же, что в разделе устройств: вопрос про отвязку один
                  // на продукт, и разойтись его формулировки не должны.
                  texts={{
                    unlink: tDevice("admin.unlink"),
                    title: tDevice("admin.confirm.title", {
                      station: station.name,
                    }),
                    warning: tDevice("admin.confirm.warning"),
                    confirmLabel: tDevice("admin.unlink"),
                    cancelLabel: tCatalog("actions.cancel"),
                  }}
                />
              </div>
            ))}
          </>
        )}

        <PairTabletCard stationId={station.id} />

        {/* D152 и просьба владельца: «дать инструкцию, как привязывать планшет». */}
        <ol className={STEPS_CLASS} data-testid="pair-steps">
          <li>{t("pairing.step1")}</li>
          <li>{t("pairing.step2")}</li>
          <li>{t("pairing.step3")}</li>
        </ol>
        <div className={FACTS_CLASS} data-testid="pair-facts">
          <p>{t("pairing.factTtl")}</p>
          <p>{t("pairing.factReissue")}</p>
          <p>{t("pairing.factPersists")}</p>
        </div>
      </Card>
    </AdminPage>
  );
}
