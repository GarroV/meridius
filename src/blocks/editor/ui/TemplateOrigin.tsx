import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { submitDismissTemplateUpdate } from "../actions";
import { pickEditorText } from "../localized-text";
import { checklistTemplateUpdatePath } from "../routes";
import type { TemplateOrigin as Origin } from "../template-updates";

// Плашка эталона `.notice` в спокойном тоне, а не `.notice--warn`: обновление шаблона —
// приглашение, а не требование (D154), и жёлтый цвет предупреждения сказал бы обратное.
const NOTICE_CLASS =
  "bg-surface-2 mb-[var(--space-7)] flex flex-col gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line-strong)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)]";
const LINE_CLASS =
  "mb-[var(--space-7)] text-[length:var(--fs-meta)] text-[var(--ink-3)]";
// Две кнопки одного веса (user-flow §5.1): «Оставить как есть» равноправна принятию.
const BUTTON_CLASS =
  "bg-surface text-ink inline-flex h-[var(--control-h)] cursor-pointer items-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium no-underline hover:border-[var(--line-control-2)] hover:bg-[var(--surface-2)]";

/**
 * Строка происхождения копии шаблона (D155, user-flow §5.3): «Копия шаблона "Открытие
 * смены", версия 3». Шаблон ушёл вперёд, а страна это ещё не отклонила — строка
 * становится приглашением с двумя равными действиями: посмотреть отличия или оставить
 * как есть. Работает без JavaScript: ссылка и обычная форма.
 */
export async function TemplateOrigin({
  checklistId,
  origin,
  locale,
}: {
  readonly checklistId: string;
  readonly origin: Origin;
  readonly locale: string;
}): Promise<ReactElement> {
  const t = await getTranslations("editor.templateUpdate");
  const title = pickEditorText(origin.templateTitle, locale);

  if (!origin.hasUpdate) {
    return (
      <p data-testid="template-origin" className={LINE_CLASS}>
        {t("origin", { title, version: origin.sourceVersion })}
      </p>
    );
  }

  return (
    <div data-testid="template-update" className={NOTICE_CLASS}>
      <div className="flex flex-col gap-[var(--space-2)]">
        <strong className="font-semibold">
          {t("updated", { title, version: origin.latestVersion })}
        </strong>
        <span className="text-[var(--ink-2)]">{t("updatedHint")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-[var(--space-4)]">
        <Link
          href={checklistTemplateUpdatePath(checklistId)}
          scroll={false}
          data-testid="template-update-view"
          className={BUTTON_CLASS}
        >
          {t("view")}
        </Link>
        <form action={submitDismissTemplateUpdate}>
          <input type="hidden" name="checklistId" value={checklistId} />
          <input type="hidden" name="version" value={origin.latestVersion} />
          <button
            type="submit"
            data-testid="template-update-dismiss"
            className={BUTTON_CLASS}
          >
            {t("dismiss")}
          </button>
        </form>
      </div>
    </div>
  );
}
