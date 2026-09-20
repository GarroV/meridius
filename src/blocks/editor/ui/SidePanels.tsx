import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

import type { VersionSummary } from "../drafts";
import type { LibraryEntry } from "../library-links";
import { pickEditorText } from "../localized-text";
import type { WindowValue } from "../window-field";
import type { WindowVisibility } from "../window-visibility";
import { windowVisibility } from "../window-visibility";

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const CARD_HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const META_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const TAG_BASE =
  "inline-flex h-[20px] items-center rounded-[var(--r-mark)] border px-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] whitespace-nowrap uppercase";
const TAG_DRAFT = `${TAG_BASE} border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--st-draft)]`;
const TAG_OK = `${TAG_BASE} border-[var(--ok-line)] bg-[var(--ok-soft)] text-[var(--ok)]`;
const TAG_PLAIN = `${TAG_BASE} border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink-2)]`;
const SMALL_BUTTON_CLASS =
  "bg-surface text-ink flex h-[var(--control-h-sm)] cursor-pointer items-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-5)] text-[length:var(--fs-dense)] font-medium hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-45";

/**
 * Версии чек-листа. Панель отвечает на вопрос «что сейчас видит сотрудник и что
 * изменится, если опубликовать»: черновик сверху, дальше опубликованная и архивные.
 */
export function VersionsPanel({
  versions,
}: {
  readonly versions: readonly VersionSummary[];
}) {
  const t = useTranslations("editor.versions");
  const format = useFormatter();

  return (
    <div className={CARD_CLASS} data-testid="versions-panel">
      <div className={CARD_HEAD_CLASS}>
        <h2 className="text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold">
          {t("title")}
        </h2>
      </div>
      <div className="flex flex-col gap-[var(--space-5)] p-[var(--space-7)]">
        {versions.map((version) => (
          <div
            key={version.id}
            data-testid="version-row"
            className="flex items-center gap-[var(--space-5)]"
          >
            {version.status === "draft" ? (
              <span className={TAG_DRAFT}>{t("draft")}</span>
            ) : (
              <span
                className={version.status === "published" ? TAG_OK : TAG_PLAIN}
              >
                {`v${String(version.versionNumber ?? 0)}`}
              </span>
            )}
            <span className={META_CLASS}>
              {version.status === "draft"
                ? t("draftMeta")
                : `${version.publishedAt === null ? "" : format.dateTime(version.publishedAt, { day: "numeric", month: "long" })} · ${t("submissions", { count: version.submissionCount })}`}
            </span>
          </div>
        ))}
        <p className={`m-0 ${META_CLASS}`}>{t("hint")}</p>
      </div>
    </div>
  );
}

/**
 * Библиотека блоков: отсюда блок вставляется в чек-лист одним нажатием (D011).
 * Своего экрана у библиотеки здесь нет — его строит блок `library`.
 */
export function LibraryPanel({
  library,
  insertedBlockIds,
  locale,
  onInsert,
}: {
  readonly library: readonly LibraryEntry[];
  readonly insertedBlockIds: readonly string[];
  readonly locale: string;
  readonly onInsert: (blockId: string) => void;
}) {
  const t = useTranslations("editor.library");

  return (
    <div className={CARD_CLASS} data-testid="library-panel">
      <div className={CARD_HEAD_CLASS}>
        <h2 className="text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold">
          {t("title")}
        </h2>
        <Link
          className="text-accent ml-auto text-[length:var(--fs-dense)] font-medium no-underline hover:underline"
          href={ADMIN_SECTIONS.library.path}
        >
          {t("all")}
        </Link>
      </div>
      <div className="flex flex-col">
        {library.length === 0 ? (
          <p className={`m-0 p-[var(--space-7)] ${META_CLASS}`}>{t("empty")}</p>
        ) : (
          library.map((block) => {
            const inserted = insertedBlockIds.includes(block.id);
            return (
              <div
                key={block.id}
                data-testid="library-block"
                className="flex items-center gap-[var(--space-4)] border-b border-[var(--line)] px-[var(--space-6)] py-[var(--space-5)] text-[length:var(--fs-dense)] last:border-b-0"
              >
                <span>{pickEditorText(block.title, locale)}</span>
                <span className="text-[length:var(--fs-micro)] text-[var(--ink-3)]">
                  {`· ${String(block.usageCount)}`}
                </span>
                <button
                  type="button"
                  data-testid="library-insert"
                  className={`${SMALL_BUTTON_CLASS} ml-auto`}
                  disabled={inserted}
                  onClick={() => {
                    onInsert(block.id);
                  }}
                >
                  {inserted ? t("inserted") : t("insert")}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Плашка эталона `.notice` и её предупреждающий вид `.notice--warn` (design/app.css):
// один элемент в двух тонах, а не два разных элемента. Тем же приёмом — основа плюс
// тон — плашка построена в `core/ui/StateScreen`.
const NOTICE_BASE_CLASS =
  "flex flex-col gap-[var(--space-4)] rounded-[var(--r-block)] border px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)]";
const NOTICE_PLAIN_CLASS = `${NOTICE_BASE_CLASS} bg-surface-2 border-[var(--line-strong)]`;
const NOTICE_WARN_CLASS = `${NOTICE_BASE_CLASS} border-[var(--warn-line)] bg-[var(--warn-soft)] text-[var(--warn-ink)]`;

/** Ключ словаря под вердикт: открыто, откроется сегодня, откроется завтра. */
function windowMessageKey(verdict: WindowVisibility): string {
  if (verdict.open) return "windowOpen";
  return verdict.tomorrow ? "windowClosedTomorrow" : "windowClosedToday";
}

/**
 * Подсказка о станции: куда уедет опубликованная версия — и увидит ли её сотрудник
 * сегодня.
 *
 * Про окно здесь сказано потому, что окно — единственный механизм выбора того, что
 * откроет QR станции (D004), а форма заведения подставляет первое окно списка. До T275
 * редактор знал и окно, и часовой пояс пиццерии, но молчал: методист, опубликовавший
 * утренний чек-лист в 11:30, узнавал о промахе от сотрудника — через смену.
 *
 * Время берётся у ПИЦЦЕРИИ (`station.localTime`, счёт PostgreSQL, D026), а не у
 * браузера: методист может сидеть в другом поясе, и «сейчас» у него и у кухни разное.
 * Часы принадлежат той станции, к которой чек-лист УЖЕ привязан: станция, только что
 * выбранная в списке и ещё не сохранённая, привязкой не стала, и подсказка о ней
 * молчит — как молчала о ней и до T275.
 * Посчитано оно при отрисовке страницы и за долгое редактирование устаревает — эту
 * дыру закрывает не эта подсказка, а состояние публикации (`closedWindow`), которое
 * сервер считает в миг нажатия.
 */
export function StationNotice({
  station,
  window,
}: {
  readonly station: {
    name: string;
    storeName: string;
    localTime: string | null;
  } | null;
  readonly window: WindowValue;
}) {
  const t = useTranslations("editor.notice");
  const now = station?.localTime ?? null;
  const verdict = now === null ? null : windowVisibility(window, now);

  return (
    <div
      data-testid="station-notice"
      className={
        verdict !== null && !verdict.open
          ? NOTICE_WARN_CLASS
          : NOTICE_PLAIN_CLASS
      }
    >
      <div>
        {station === null
          ? t("noStation")
          : t("station", { station: station.name, store: station.storeName })}
      </div>
      {verdict === null || now === null ? null : (
        <div data-testid="window-notice">
          {t(windowMessageKey(verdict), {
            start: window.start,
            end: window.end,
            now,
            opensAt: verdict.opensAt,
          })}
        </div>
      )}
    </div>
  );
}
