import { useFormatter, useTranslations } from "next-intl";

import type { EditorActionState } from "../action-state";
import type { VersionSummary } from "../drafts";

const TAG_DRAFT =
  "inline-flex h-[20px] items-center rounded-[var(--r-mark)] border border-[var(--line-strong)] bg-[var(--surface-3)] px-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] whitespace-nowrap text-[var(--st-draft)] uppercase";
const META_CLASS =
  "text-[length:var(--fs-meta)] whitespace-nowrap text-[var(--ink-3)]";
// Предупреждение у кнопки: плашка `.notice--warn` эталона в размер полосы действий.
// Не `text-err`: отказа не было, версия опубликована.
const WARN_CLASS =
  "max-w-[420px] rounded-[var(--r-control)] border border-[var(--warn-line)] bg-[var(--warn-soft)] px-[var(--space-5)] py-[var(--space-3)] text-[length:var(--fs-dense)] text-[var(--warn-ink)]";

/**
 * Состояние чек-листа в верхней полосе: метка черновика, какая версия опубликована
 * сейчас и чем закончилось последнее действие. Отказ показывается тут же и текстом,
 * а не кодом: код пришёл с сервера, а слова выбирает экран — интерфейс двуязычный.
 */
export function EditorStatus({
  versions,
  saveState,
  publishState,
}: {
  readonly versions: readonly VersionSummary[];
  readonly saveState: EditorActionState;
  readonly publishState: EditorActionState;
}) {
  const t = useTranslations("editor");
  const format = useFormatter();
  const published = versions.find((version) => version.status === "published");
  const failed =
    saveState.status === "failed"
      ? saveState
      : publishState.status === "failed"
        ? publishState
        : null;

  if (failed !== null) {
    return (
      <span
        role="alert"
        data-testid="editor-error"
        className="text-err rounded-[var(--r-control)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-5)] py-[var(--space-3)] text-[length:var(--fs-dense)]"
      >
        {t(`errors.${failed.errorCode ?? "unknown"}`, {
          limit: failed.limit ?? 0,
        })}
      </span>
    );
  }

  if (publishState.status === "published") {
    const closed = publishState.closedWindow;
    // Окно оказалось закрыто — версия создана, но сегодня её на станции никто не
    // увидит. Это не отказ (он красный), а предупреждение: плашка `.notice--warn`
    // эталона. Сказано оно ЗДЕСЬ, у кнопки, а не только подсказкой справа, потому
    // что подсказка посчитана при отрисовке страницы и к мгновению нажатия могла
    // устареть; это состояние сервер считает в миг публикации (T275).
    //
    // Опознаватель `editor-published` остаётся на месте в ОБОИХ случаях: иначе
    // сценарии, публикующие в обычное окно, краснели бы в зависимости от часа
    // прогона — предупреждение появлялось бы вместо подтверждения.
    return (
      <span
        data-testid="editor-published"
        {...(closed === undefined ? {} : { role: "status" })}
        className={closed === undefined ? META_CLASS : WARN_CLASS}
      >
        {t("screen.published", { number: publishState.versionNumber ?? 0 })}
        {closed === undefined ? null : (
          <span data-testid="editor-closed-window">
            {` · ${t(
              closed.tomorrow
                ? "notice.windowClosedTomorrow"
                : "notice.windowClosedToday",
              {
                start: closed.start,
                end: closed.end,
                now: closed.now,
                opensAt: closed.opensAt,
              },
            )}`}
          </span>
        )}
      </span>
    );
  }

  return (
    <>
      <span className={TAG_DRAFT}>{t("screen.draftTag")}</span>
      <span data-testid="editor-meta" className={META_CLASS}>
        {saveState.status === "saved"
          ? t("screen.saved")
          : published === undefined
            ? t("screen.neverPublished")
            : t("screen.publishedMeta", {
                number: published.versionNumber ?? 0,
                date:
                  published.publishedAt === null
                    ? ""
                    : format.dateTime(published.publishedAt, {
                        day: "numeric",
                        month: "long",
                      }),
              })}
      </span>
    </>
  );
}
