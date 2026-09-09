import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { submitCreateBlock } from "../actions";
import { AdminShell } from "./AdminShell";
import { BlockEditor } from "./BlockEditor";
import type { LibraryBlockRow, LibraryModel, LibrarySelection } from "./model";

/**
 * Экран библиотеки блоков (эталон `docs/furca/design/screens/library.html`):
 * слева список блоков, справа правка выбранного и «Где используется».
 *
 * Всё, что показано, уже посчитано в `build-model.ts` — экран ничего не решает сам:
 * ни что считать использованием, ни какой блок открыт. Правка блока живёт в клиентской
 * части (`BlockEditor`), потому что пункты набираются с клавиатуры без перезагрузки;
 * остальное — обычная серверная разметка.
 */

type Translate = Awaited<ReturnType<typeof getTranslations>>;

const CARD_CLASS =
  "bg-surface rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";
const CARD_HEAD_CLASS =
  "flex items-center gap-[var(--space-6)] rounded-t-[var(--r-block)] border-b border-[var(--line)] bg-[var(--surface-3)] px-[var(--space-7)] py-[var(--space-6)]";
const CARD_TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const NOTICE_CLASS =
  "flex gap-[var(--space-5)] rounded-[var(--r-block)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--space-7)] py-[var(--space-6)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)]";
const ROW_CLASS =
  "flex items-center gap-[var(--space-4)] border-b border-[var(--line)] px-[var(--space-6)] py-[var(--space-5)] text-ink no-underline hover:bg-[var(--surface-2)]";
const ROW_SELECTED_CLASS =
  "text-accent flex items-center gap-[var(--space-4)] border-b border-[var(--line)] bg-[var(--accent-soft)] px-[var(--space-6)] py-[var(--space-5)] font-medium no-underline";
const ROW_META_CLASS =
  "ml-auto text-[length:var(--fs-meta)] font-normal text-[var(--ink-3)]";
const TAG_ACCENT_CLASS =
  "inline-flex h-[20px] items-center rounded-[var(--r-mark)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-[var(--space-4)] text-[length:var(--fs-micro)] font-semibold tracking-[var(--tracking-micro)] whitespace-nowrap text-[var(--accent)] uppercase no-underline hover:border-[var(--accent)]";
const META_CLASS = "text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const BTN_PRIMARY_CLASS =
  "bg-accent inline-flex h-[var(--control-h)] cursor-pointer items-center justify-center rounded-[var(--r-control)] border border-[var(--accent)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium text-[var(--ink-inverse)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]";

/** Строка списка: название, число пунктов и где вставлен — «3 пункта · в 7». */
function BlockRow({
  row,
  t,
}: {
  readonly row: LibraryBlockRow;
  readonly t: Translate;
}): ReactElement {
  return (
    <a
      href={row.href}
      data-testid="library-block"
      data-selected={row.selected ? "true" : "false"}
      aria-current={row.selected ? "true" : undefined}
      className={row.selected ? ROW_SELECTED_CLASS : ROW_CLASS}
    >
      {row.title}
      <span className={ROW_META_CLASS}>
        {t("items", { count: row.itemCount })} ·{" "}
        {row.usageCount === 0 ? (
          // Блок, не вставленный никуда, помечен явно (критерий готовности 5):
          // иначе методист не отличит его от вставленного и будет править вслепую.
          <span data-testid="block-unused" className="text-[var(--ink-empty)]">
            {t("usedNowhere")}
          </span>
        ) : (
          t("usedIn", { count: row.usageCount })
        )}
      </span>
    </a>
  );
}

/**
 * «Где используется»: чек-листы ссылками и цена правки словами.
 *
 * Строка о последствиях стоит здесь, рядом со списком, а не только числом у кнопки:
 * «затронет 5 черновиков» без перечисления — это цифра, которую нечем проверить.
 */
function UsagesCard({
  selection,
  t,
}: {
  readonly selection: LibrarySelection;
  readonly t: Translate;
}): ReactElement {
  const { impact, usages } = selection;

  return (
    <section className={CARD_CLASS} data-testid="block-usages">
      <div className={CARD_HEAD_CLASS}>
        <h2 className={CARD_TITLE_CLASS}>{t("usagesTitle")}</h2>
        <span className={`ml-auto ${META_CLASS}`} data-testid="usages-count">
          {t("usagesCount", { count: impact.checklists })}
        </span>
      </div>
      <div className="p-[var(--space-7)]">
        {usages.length === 0 ? (
          <p className={`m-0 ${META_CLASS}`} data-testid="usages-empty">
            {t("usagesEmpty")}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-[var(--space-4)]">
              {usages.map((usage) => (
                <a
                  key={usage.checklistId}
                  href={usage.href}
                  data-testid="usage-link"
                  data-published={usage.published ? "true" : "false"}
                  className={TAG_ACCENT_CLASS}
                >
                  {usage.label}
                </a>
              ))}
            </div>
            <p
              className={`mt-[var(--space-6)] mb-0 ${META_CLASS}`}
              data-testid="usage-impact"
              data-drafts={impact.drafts}
              data-published={impact.published}
            >
              {t("impactDrafts", { drafts: impact.drafts })}{" "}
              {impact.published === 0
                ? t("impactNoPublished")
                : t("impactPublished", { published: impact.published })}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function EmptyLibrary({ t }: { readonly t: Translate }): ReactElement {
  return (
    <div className={CARD_CLASS} data-testid="library-empty">
      <div className="flex flex-col items-center gap-[var(--space-5)] px-[var(--space-8)] py-[var(--space-10)] text-center text-[var(--ink-2)]">
        <p className="text-ink m-0 text-[length:var(--fs-title)] font-semibold">
          {t("empty")}
        </p>
        <p className="m-0">{t("emptyHint")}</p>
      </div>
    </div>
  );
}

export async function LibraryScreen({
  model,
  locale,
}: {
  readonly model: LibraryModel;
  readonly locale: string;
}): Promise<ReactElement> {
  const t = await getTranslations("library");

  return (
    <AdminShell
      testId="library-screen"
      breadcrumb={t("crumbs")}
      title={t("title")}
      topbarAction={
        <form action={submitCreateBlock}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="title" value={t("newTitle")} />
          <button
            type="submit"
            data-testid="new-block"
            className={BTN_PRIMARY_CLASS}
          >
            {t("new")}
          </button>
        </form>
      }
    >
      <div className={NOTICE_CLASS}>
        <div>{t("notice")}</div>
      </div>

      {model.selection === null ? (
        <EmptyLibrary t={t} />
      ) : (
        <div className="grid items-start gap-[var(--space-8)] [grid-template-columns:320px_1fr]">
          <section className={CARD_CLASS} data-testid="library-list">
            <div className={CARD_HEAD_CLASS}>
              <h2 className={CARD_TITLE_CLASS}>{t("listTitle")}</h2>
            </div>
            <div>
              {model.blocks.map((row) => (
                <BlockRow key={row.id} row={row} t={t} />
              ))}
            </div>
          </section>

          <div className="flex min-w-0 flex-col gap-[var(--space-6)]">
            <BlockEditor
              key={model.selection.id}
              blockId={model.selection.id}
              locale={locale}
              initialTitle={model.selection.title}
              initialItems={model.selection.items}
            />
            <UsagesCard selection={model.selection} t={t} />
          </div>
        </div>
      )}
    </AdminShell>
  );
}
