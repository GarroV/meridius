import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { Drawer } from "@/blocks/core/ui/Drawer";
import { requireChecklistEditable } from "@/blocks/auth/access";
import { requireAdmin } from "@/blocks/auth/guard";

import {
  submitDismissTemplateUpdate,
  submitTakeTemplateChanges,
} from "../actions";
import { pickEditorText } from "../localized-text";
import { checklistPath } from "../routes";
import type { TemplateChange, TemplateChangeKind } from "../template-diff";
import { loadTemplateUpdate } from "../template-updates";

const FORM_ID = "template-update-form";
const KINDS: readonly TemplateChangeKind[] = ["added", "changed", "removed"];

const BUTTON_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] cursor-pointer items-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";
const GROUP_HEAD_CLASS =
  "m-0 text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const ROW_CLASS =
  "flex min-h-[var(--tap-min)] cursor-pointer items-start gap-[var(--space-5)] border-t border-[var(--line)] py-[var(--space-4)]";
const META_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";

function ChangeRow({
  change,
  locale,
  untitled,
  was,
  section,
}: {
  readonly change: TemplateChange;
  readonly locale: string;
  readonly untitled: string;
  readonly was: (title: string) => string;
  readonly section: (title: string) => string;
}): ReactElement {
  const name = (item: TemplateChange["after"]) =>
    item === undefined ? "" : pickEditorText(item.title, locale) || untitled;
  const current = change.after ?? change.before;
  const renamed =
    change.kind === "changed" && name(change.before) !== name(change.after);

  return (
    <label className={ROW_CLASS} data-testid="template-change">
      <input
        type="checkbox"
        name="itemId"
        value={change.itemId}
        form={FORM_ID}
        defaultChecked
        data-testid={`template-change-${change.itemId}`}
        className="mt-[3px] size-[18px] shrink-0 accent-[var(--accent)]"
      />
      <span className="flex min-w-0 flex-col gap-[var(--space-1)]">
        <span className="break-words">{name(current)}</span>
        {renamed ? (
          <span className={META_CLASS}>{was(name(change.before))}</span>
        ) : null}
        <span className={META_CLASS}>
          {section(pickEditorText(change.sectionTitle, locale) || untitled)}
        </span>
      </span>
    </label>
  );
}

/**
 * «Что изменилось в шаблоне» — панель справа поверх редактора копии (D162, T336).
 *
 * Каждое отличие — своей строкой с отметкой: решает человек, по каждому (user-flow §5.3),
 * а не «принять всё». Отметки стоят сразу: пришедший сюда пришёл взять обновление, и
 * снять пару лишних быстрее, чем отметить двадцать нужных. Взятое ложится в черновик —
 * публикует страна сама, когда посмотрит.
 */
export async function TemplateUpdatePanel({
  id,
  stale,
}: {
  readonly id: string;
  readonly stale: boolean;
}): Promise<ReactElement> {
  await requireChecklistEditable(await requireAdmin(), id);
  const update = await loadTemplateUpdate(id);
  if (update === null) notFound();

  const locale = await getLocale();
  const t = await getTranslations("editor.templateUpdate");
  const tEditor = await getTranslations("editor");
  const closeHref = checklistPath(id);
  const { origin, changes } = update;

  return (
    <Drawer
      testId="template-update-screen"
      title={t("title")}
      closeHref={closeHref}
      closeLabel={tEditor("rail.close")}
      footer={
        <div className="flex flex-col gap-[var(--space-4)]">
          <div className="flex flex-wrap items-center justify-end gap-[var(--space-5)]">
            {origin.hasUpdate ? (
              <form action={submitDismissTemplateUpdate}>
                <input type="hidden" name="checklistId" value={id} />
                <input
                  type="hidden"
                  name="version"
                  value={origin.latestVersion}
                />
                <button
                  type="submit"
                  data-testid="template-update-panel-dismiss"
                  className={BUTTON_CLASS}
                >
                  {t("dismiss")}
                </button>
              </form>
            ) : null}
            {changes.length > 0 ? (
              <button
                type="submit"
                form={FORM_ID}
                data-testid="template-update-take"
                className={BUTTON_CLASS}
              >
                {t("take")}
              </button>
            ) : null}
          </div>
          {changes.length > 0 ? (
            <p className={`m-0 text-right ${META_CLASS}`}>{t("takeHint")}</p>
          ) : null}
        </div>
      }
    >
      <form id={FORM_ID} action={submitTakeTemplateChanges}>
        <input type="hidden" name="checklistId" value={id} />
        <input type="hidden" name="version" value={origin.latestVersion} />
      </form>
      <div className="flex flex-col gap-[var(--space-7)]">
        {stale ? (
          <p
            data-testid="template-update-stale"
            className="m-0 rounded-[var(--r-block)] border border-[var(--warn-line)] bg-[var(--warn-soft)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)] text-[var(--warn-ink)]"
          >
            {t("stale")}
          </p>
        ) : null}
        <p className="m-0 text-[length:var(--fs-dense)] text-[var(--ink-2)]">
          {t("intro", {
            title: pickEditorText(origin.templateTitle, locale),
            from: origin.sourceVersion,
            to: origin.latestVersion,
          })}
        </p>
        {changes.length === 0 ? (
          <p className={`m-0 ${META_CLASS}`}>{t("none")}</p>
        ) : null}
        {KINDS.map((kind) => {
          const group = changes.filter((change) => change.kind === kind);
          if (group.length === 0) return null;
          return (
            <section key={kind} data-testid={`template-changes-${kind}`}>
              <h3 className={GROUP_HEAD_CLASS}>{t(kind)}</h3>
              <div className="mt-[var(--space-3)]">
                {group.map((change) => (
                  <ChangeRow
                    key={change.itemId}
                    change={change}
                    locale={locale}
                    untitled={t("untitled")}
                    was={(title) => t("was", { title })}
                    section={(title) => t("section", { title })}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Drawer>
  );
}
