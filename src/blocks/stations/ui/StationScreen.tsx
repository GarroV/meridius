import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import { listUnassignedChecklists } from "@/blocks/catalog";
import type { LocalizedText } from "@/blocks/data";
import { asLocale } from "@/blocks/core/locale";
import { AdminPage } from "@/blocks/core/ui/AdminPage";
import { formActionPath } from "@/blocks/core/base-path";
import { ConfirmDialog } from "@/blocks/core/ui/ConfirmDialog";
import { PIN_TTL_SECONDS } from "@/blocks/device/pin";
import { PairGuide } from "@/blocks/device/ui/PairGuide";
import { PairTabletCard } from "@/blocks/device/ui/PairTabletCard";
import { UnlinkButton } from "@/blocks/device/ui/UnlinkButton";
import { qrScreenHref, qrStickerHref } from "@/blocks/qr/ui/view";

import { getStationDetail } from "../detail";
import {
  submitAssignChecklist,
  submitDetachChecklist,
  submitReissueCode,
} from "./actions";
import { CONFIRM_REISSUE, stationHref, stickersHref } from "./view";

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
const FAILED_CLASS =
  "text-err rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-6)] py-[var(--space-5)] text-[length:var(--fs-dense)]";
const SECONDS_IN_MINUTE = 60;

/** Сколько минут живёт код привязки — из `device/pin.ts`, а не из текста. */
function pinMinutes(): number {
  return PIN_TTL_SECONDS / SECONDS_IN_MINUTE;
}
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
  readonly children: ReactNode;
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

/**
 * Вопрос «перевыпустить код станции?» на карточке (T266, T312). Окно общее на продукт
 * (`core/ui/ConfirmDialog`), тексты — справочника (`catalog.confirm.*`): вопрос один и
 * тот же с любого экрана, и две редакции предупреждения разошлись бы молча.
 */
async function ReissueDialog({
  open,
  stationId,
  stationName,
  cancelHref,
}: {
  readonly open: boolean;
  readonly stationId: string;
  readonly stationName: string;
  readonly cancelHref: string;
}): Promise<ReactElement | null> {
  if (!open) return null;
  const t = await getTranslations("catalog");
  return (
    <ConfirmDialog
      name="reissue"
      action={submitReissueCode}
      fields={{ stationId }}
      title={t("confirm.reissueTitle", { name: stationName })}
      warning={t("confirm.reissueBody")}
      confirmLabel={t("actions.confirmReissue")}
      cancelLabel={t("actions.cancel")}
      cancelHref={cancelHref}
    />
  );
}

export interface StationScreenProps {
  readonly stationId: string;
  /**
   * Какой вопрос открыт на карточке — решает адрес, а не состояние: `reissue` —
   * перевыпуск кода, id планшета — его отвязка (`?confirm=`).
   */
  readonly confirm?: string | undefined;
  /** Отвязка не удалась (`?failed=1`, ставит `device/ui/UnlinkButton`). */
  readonly unlinkFailed?: boolean;
  /** Полный адрес страницы привязки, который набирают на планшете (D167). */
  readonly pairAddress: string;
}

export async function StationScreen({
  stationId,
  confirm,
  unlinkFailed = false,
  pairAddress,
}: StationScreenProps): Promise<ReactElement | null> {
  const station = await getStationDetail(stationId);
  if (station === null) return null;

  const t = await getTranslations("stations");
  const tDevice = await getTranslations("device");
  const tCatalog = await getTranslations("catalog");
  const locale = asLocale(await getLocale());
  const free = await listUnassignedChecklists();
  const here = stationHref(station.id);
  const ref = { storeId: station.storeId, stationId: station.id };

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
                <span className="flex flex-col">
                  <span className="font-medium">
                    {localized(checklist.title, locale)}
                  </span>
                  {/* Происхождение (T310, D149): копию правят как свою, но человек
                      обязан видеть, с какого шаблона и какой его версии она снята. */}
                  <span
                    className={META_CLASS}
                    data-testid="checklist-origin"
                    data-origin={checklist.origin.kind}
                  >
                    {checklist.origin.kind === "copy"
                      ? t("card.originCopy", {
                          template: localized(
                            checklist.origin.templateTitle,
                            locale,
                          ),
                          version: checklist.origin.version,
                        })
                      : t("card.originLocal")}
                  </span>
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
            href={stickersHref([station.id])}
            className={BUTTON_CLASS}
            data-testid="print-sticker"
          >
            {t("card.print")}
          </Link>
          {/* Файл наклейки и экран кода живут под старым адресом QR (T312): туда ведут
              только эти две ссылки, сам лист QR уводит в «Станции».
              Файл — обычной ссылкой с `download`, а не `<Link>`: его отдаёт маршрут, и
              браузер идёт ровно по написанному адресу, как с нативной формой, —
              поэтому базовый путь площадки приставляется тем же правилом. */}
          <a
            href={formActionPath(qrStickerHref(ref))}
            className={BUTTON_CLASS}
            data-testid="download-sticker"
            download
          >
            {t("card.download")}
          </a>
          <Link
            href={qrScreenHref(ref)}
            className={BUTTON_CLASS}
            data-testid="qr-open-screen"
          >
            {t("card.openScreen")}
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

        {unlinkFailed ? (
          <p className={FAILED_CLASS} role="alert" data-testid="unlink-failed">
            {tDevice("admin.failed")}
          </p>
        ) : null}

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
                data-station-id={station.id}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">
                    {t("card.pairedAt", { at: tablet.pairedAt })}
                  </span>
                  <span className={META_CLASS}>
                    {t("card.lastSeen", { at: tablet.lastSeenAt })}
                  </span>
                </span>
                <UnlinkButton
                  deviceId={tablet.id}
                  open={confirm === tablet.id}
                  screenHref={here}
                  // Подписи те же, что были в разделе устройств: вопрос про отвязку
                  // один на продукт, и разойтись его формулировки не должны.
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
            {/* Перепривязки отдельной кнопкой нет (D167): код этой станции, введённый
                на планшете, сам снимает его прежнюю привязку. */}
            <p className={META_CLASS}>{tDevice("admin.drawer.replaceText")}</p>
          </>
        )}

        <PairTabletCard stationId={station.id} address={pairAddress} />

        {/* D152 и просьба владельца: «дать инструкцию, как привязывать планшет».
            Шаги — общие с продуктом (`device/ui/PairGuide`), с настоящим адресом
            страницы привязки (D167). Факт про перевыпуск наклейки — свой у карточки:
            наклейка и планшет стоят на ней рядом, и их путают. */}
        <PairGuide address={pairAddress} minutes={pinMinutes()} compact />
        <p className={FACTS_CLASS} data-testid="pair-facts">
          {t("pairing.factReissue")}
        </p>
      </Card>

      <ReissueDialog
        open={confirm === CONFIRM_REISSUE}
        stationId={station.id}
        stationName={station.name}
        cancelHref={here}
      />
    </AdminPage>
  );
}
