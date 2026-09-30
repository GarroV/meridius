// Главная кабинета (D148): то, что у вошедшего есть сейчас, а не указатель разделов.
//
// Три вещи и в таком порядке: станции без чек-листа (их наклейка открывает пустоту —
// главная дырка, поэтому первой строкой), его чек-листы, последние заполнения. Когда
// чек-листов нет вовсе, всего этого нет тоже: остаётся один призыв — сделать первый из
// шаблона. Два призыва рядом («сделайте чек-лист» и «у вас 12 станций без чек-листа»)
// говорили бы одно и то же разными словами и спорили бы за первый шаг.
//
// Экран только рисует. Что считается «моим», что дыркой и какие заполнения видны,
// решает страница по области видимости вошедшего (D145): `core` не видит ни базы, ни
// чужих блоков (граница модулей), поэтому получает готовые строки и готовые адреса.
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { STATUS_ACTION_CLASS, StatusCard } from "./StatusCard";

/** Чек-лист строкой главной. */
interface HomeChecklist {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  /** «Страна · пиццерия · станция»; null — чек-лист ни на какой станции не висит. */
  readonly place: string | null;
  readonly publishedNumber: number | null;
  readonly hasUnpublishedChanges: boolean;
}

/** Заполнение строкой главной. */
interface HomeSubmission {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  readonly place: string;
  readonly submittedAt: Date;
}

export interface AdminHomeProps {
  /** Первые чек-листы вошедшего; всего их `checklistTotal`. */
  readonly checklists: readonly HomeChecklist[];
  readonly checklistTotal: number;
  /** Сколько станций его пространства стоят без чек-листа. */
  readonly stationsWithoutChecklist: number;
  readonly submissions: readonly HomeSubmission[];
  readonly now: Date;
  readonly links: {
    readonly checklists: string;
    readonly stationsWithoutChecklist: string;
    readonly feed: string;
    readonly templates: string;
  };
}

const GAP_CLASS =
  "flex flex-wrap items-center justify-between gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--err-line)] bg-[var(--err-soft)] px-[var(--space-7)] py-[var(--space-6)]";
const GAP_TITLE_CLASS =
  "m-0 text-[length:var(--fs-lead)] leading-[var(--lh-lead)] font-semibold text-[var(--err)]";
const GAP_TEXT_CLASS =
  "m-0 text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";
const BUTTON_CLASS =
  "bg-surface text-ink flex h-[var(--control-h)] shrink-0 items-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--line-control-2)] hover:no-underline";
const GRID_CLASS =
  "grid grid-cols-1 items-start gap-[var(--space-6)] lg:grid-cols-2";
const CARD_CLASS =
  "bg-surface flex flex-col rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const CARD_HEAD_CLASS =
  "flex items-baseline justify-between gap-[var(--space-5)] border-b border-[var(--line)] px-[var(--space-7)] py-[var(--space-5)]";
const CARD_TITLE_CLASS =
  "text-ink m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const MORE_CLASS =
  "shrink-0 text-[length:var(--fs-dense)] text-[var(--ink-2)] no-underline hover:text-ink hover:no-underline";
const LIST_CLASS = "m-0 flex list-none flex-col p-[var(--space-3)]";
const ROW_CLASS =
  "text-ink flex items-start justify-between gap-[var(--space-5)] rounded-[var(--r-control)] px-[var(--space-5)] py-[var(--space-4)] no-underline hover:bg-[var(--surface-2)] hover:text-ink hover:no-underline";
const ROW_MAIN_CLASS = "flex min-w-0 flex-col gap-[var(--space-1)]";
const ROW_NAME_CLASS =
  "text-[length:var(--fs-body)] leading-[var(--lh-body)] font-medium [overflow-wrap:anywhere]";
const ROW_META_CLASS =
  "text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const ROW_SIDE_CLASS =
  "shrink-0 text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)] [font-variant-numeric:tabular-nums]";
const DRAFT_CLASS =
  "shrink-0 rounded-[var(--r-mark)] bg-[var(--warn-soft)] px-[var(--space-3)] text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--warn-ink)]";
const EMPTY_CLASS =
  "m-0 px-[var(--space-7)] py-[var(--space-7)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";

export async function AdminHome(props: AdminHomeProps): Promise<ReactElement> {
  const t = await getTranslations("adminHome");

  if (props.checklistTotal === 0) {
    return (
      <div data-testid="admin-home">
        <StatusCard
          testId="home-empty"
          title={t("emptyTitle")}
          text={t("emptyText")}
          action={
            <Link
              href={props.links.templates}
              data-testid="home-from-template"
              className={STATUS_ACTION_CLASS}
            >
              {t("emptyAction")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div
      data-testid="admin-home"
      className="flex flex-col gap-[var(--space-6)]"
    >
      {props.stationsWithoutChecklist > 0 ? (
        <section className={GAP_CLASS} data-testid="home-gap">
          <div className="flex min-w-0 flex-col gap-[var(--space-2)]">
            <p className={GAP_TITLE_CLASS}>
              {t("gapTitle", { count: props.stationsWithoutChecklist })}
            </p>
            <p className={GAP_TEXT_CLASS}>{t("gapText")}</p>
          </div>
          <Link
            href={props.links.stationsWithoutChecklist}
            data-testid="home-gap-link"
            className={BUTTON_CLASS}
          >
            {t("gapAction")}
          </Link>
        </section>
      ) : null}

      <div className={GRID_CLASS}>
        <ChecklistsCard {...props} />
        <SubmissionsCard {...props} />
      </div>
    </div>
  );
}

async function ChecklistsCard({
  checklists,
  checklistTotal,
  links,
}: AdminHomeProps): Promise<ReactElement> {
  const t = await getTranslations("adminHome");

  return (
    <section className={CARD_CLASS} data-testid="home-checklists">
      <div className={CARD_HEAD_CLASS}>
        <h2 className={CARD_TITLE_CLASS}>{t("checklistsTitle")}</h2>
        <Link href={links.checklists} className={MORE_CLASS}>
          {t("checklistsAll", { count: checklistTotal })}
        </Link>
      </div>
      <ul className={LIST_CLASS}>
        {checklists.map((checklist) => (
          <li key={checklist.id}>
            <Link href={checklist.href} className={ROW_CLASS}>
              <span className={ROW_MAIN_CLASS}>
                <span className={ROW_NAME_CLASS}>{checklist.title}</span>
                <span className={ROW_META_CLASS}>
                  {checklist.place ?? t("noStation")}
                </span>
              </span>
              <ChecklistState checklist={checklist} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function ChecklistState({
  checklist,
}: {
  readonly checklist: HomeChecklist;
}): Promise<ReactElement> {
  const t = await getTranslations("adminHome");

  if (checklist.publishedNumber === null) {
    return <span className={DRAFT_CLASS}>{t("unpublished")}</span>;
  }
  return (
    <span className={ROW_SIDE_CLASS}>
      {t("version", { number: checklist.publishedNumber })}
      {checklist.hasUnpublishedChanges ? ` · ${t("changed")}` : ""}
    </span>
  );
}

async function SubmissionsCard({
  submissions,
  links,
  now,
}: AdminHomeProps): Promise<ReactElement> {
  const t = await getTranslations("adminHome");
  const format = await getFormatter();

  return (
    <section className={CARD_CLASS} data-testid="home-submissions">
      <div className={CARD_HEAD_CLASS}>
        <h2 className={CARD_TITLE_CLASS}>{t("submissionsTitle")}</h2>
        <Link href={links.feed} className={MORE_CLASS}>
          {t("submissionsAll")}
        </Link>
      </div>
      {submissions.length === 0 ? (
        <p className={EMPTY_CLASS}>{t("submissionsEmpty")}</p>
      ) : (
        <ul className={LIST_CLASS}>
          {submissions.map((submission) => (
            <li key={submission.id}>
              <Link href={submission.href} className={ROW_CLASS}>
                <span className={ROW_MAIN_CLASS}>
                  <span className={ROW_NAME_CLASS}>{submission.title}</span>
                  <span className={ROW_META_CLASS}>{submission.place}</span>
                </span>
                {/* Относительное время, а не часы: пиццерии живут в разных поясах, и
                    «14:05» без пояса читалось бы временем того, кто смотрит. */}
                <time
                  dateTime={submission.submittedAt.toISOString()}
                  className={ROW_SIDE_CLASS}
                >
                  {format.relativeTime(submission.submittedAt, now)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
