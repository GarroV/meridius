import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { AdminShell } from "@/blocks/core/ui/AdminShell";

import type { SubmissionModel } from "../model";
import { AnswersCard } from "./AnswersCard";
import { OutcomeTag } from "./OutcomeTag";
import { SubmissionFacts } from "./SubmissionFacts";
import { TopbarActions } from "./TopbarActions";

/**
 * Карточка одного заполнения (эталон `docs/furca/design/screens/submission.html`,
 * T046): факты, оговорка о снимке и ответы по каждому пункту — ровно в том виде,
 * в котором их видел сотрудник (D002). Экран ничего не считает: всё уже посчитала
 * `buildSubmissionModel` (`ui/build-model.ts`).
 */

const BTN_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] items-center justify-center gap-[var(--space-4)] rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";
const NOTICE_CLASS =
  "flex gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)]";

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
type Translate = Awaited<ReturnType<typeof getTranslations>>;

/** Крошка: ссылка в ленту, затем дата и время отправки — «5 сентября, 09:12». */
function breadcrumbText(model: SubmissionModel, format: Formatter): string {
  const day = format.dateTime(model.submittedAt, {
    day: "numeric",
    month: "long",
    timeZone: model.timeZone,
  });
  const time = format.dateTime(model.submittedAt, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: model.timeZone,
  });
  return `${day}, ${time}`;
}

/** Ссылка на чек-лист в шапке: с версией, если она известна, иначе без неё. */
function checklistLinkText(model: SubmissionModel, t: Translate): string {
  return model.versionNumber === null
    ? t("checklistLinkNoVersion")
    : t("checklistLink", { number: model.versionNumber });
}

/**
 * Оговорка о снимке: «версия vN от такого-то числа» — либо без даты и номера,
 * когда версию заполнения выяснить не удалось (журнал версий короче истории
 * заполнений). Оговорка не переносится в прошлое: снимок показан как есть.
 */
function snapshotNoticeText(
  model: SubmissionModel,
  format: Formatter,
  t: Translate,
): string {
  if (model.versionNumber === null || model.versionPublishedAt === null) {
    return t("snapshotNoticeNoDate");
  }
  const date = format.dateTime(model.versionPublishedAt, {
    day: "numeric",
    month: "long",
    timeZone: model.timeZone,
  });
  return t("snapshotNotice", { number: model.versionNumber, date });
}

export async function SubmissionScreen({
  model,
}: {
  readonly model: SubmissionModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.card");
  const format = await getFormatter();

  return (
    <AdminShell
      testId="submission-screen"
      active="feed"
      narrow
      breadcrumb={
        <>
          <Link href={model.backHref} className="underline">
            {t("back")}
          </Link>{" "}
          · {breadcrumbText(model, format)}
        </>
      }
      title={t("title", {
        checklist: model.checklistTitle,
        store: model.storeName,
      })}
      topbarAction={
        <TopbarActions>
          {/* Полосе на телефоне остаётся 103 px: метка обязана переноситься, иначе
              она уезжает за край окна вместе со страницей (T203). */}
          <OutcomeTag outcome={model.outcome} flexible />
          <Link href={model.checklistHref} className={BTN_CLASS}>
            {checklistLinkText(model, t)}
          </Link>
        </TopbarActions>
      }
    >
      <SubmissionFacts model={model} />

      <div className={NOTICE_CLASS} data-testid="snapshot-notice">
        <div>{snapshotNoticeText(model, format, t)}</div>
      </div>

      <AnswersCard model={model} />
    </AdminShell>
  );
}
