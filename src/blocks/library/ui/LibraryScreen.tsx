import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { AdminShell } from "@/blocks/core/ui/AdminShell";

import { submitCreateBlock } from "../actions";
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

// Список блоков и карточка правки: две колонки, пока для них есть место, и одна, когда
// места нет (T223, дефект #100).
//
// Почему граница на `lg`, а не на складке кабинета (`--page-fold`, 768 px). Складка —
// про каркас: ниже неё боковое меню становится верхней полосой. Колонке списка это места
// не добавляет, она фиксированные 320 px. Замерено в этой копии живым браузером: на
// 1280 px карточке правки достаётся 684 px, на 768 px осталось бы 172 px, а на 390 px
// было 18 px — то есть полоска у правого края вместо карточки. Ровно так же и по той же
// причине складывается редактор (`ChecklistEditor`, `max-lg`): экран с колонкой
// постоянной ширины упирается раньше, чем кабинет целиком.
const SPLIT_CLASS =
  "grid items-start gap-[var(--space-8)] [grid-template-columns:320px_1fr] max-lg:[grid-template-columns:minmax(0,1fr)]";
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
    <Link
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
          //
          // Помечен СЛОВОМ, а не цветом. В эталоне (`library.html`, строка 64) «нигде»
          // выкрашено в `--ink-empty`, но сам `tokens.css` отводит этот токен только под
          // прочерк «значения нет», и на тексте он даёт контраст ниже порога — проверка
          // доступности падала именно на нём. Порог сильнее буквальности эталона: так уже
          // решено в D044, где ради него подвинули сам токен `--ink-3`.
          <span data-testid="block-unused">{t("usedNowhere")}</span>
        ) : (
          t("usedIn", { count: row.usageCount })
        )}
      </span>
    </Link>
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
                <Link
                  key={usage.checklistId}
                  href={usage.href}
                  data-testid="usage-link"
                  data-published={usage.published ? "true" : "false"}
                  className={TAG_ACCENT_CLASS}
                >
                  {usage.label}
                </Link>
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
  const [t, messages] = await Promise.all([
    getTranslations("library"),
    getMessages(),
  ]);

  // Правка блока — клиентская часть, а `useTranslations` в браузере работает только
  // через провайдер: без него страница отвечала бы ошибкой на СЕРВЕРЕ, ещё до
  // гидратации, и вместо экрана приходила бы заглушка «страница не загрузилась»
  // (поймано сквозным сценарием — модульные тесты разметку не рендерят).
  // Наружу уходит только нужное: свой словарь и строка пункта, которую библиотека
  // переиспользует из редактора вместе с самим компонентом строки.
  const editorMessages = messages["editor"] as AbstractIntlMessages;
  const clientMessages = {
    library: messages["library"] as AbstractIntlMessages,
    // Раздел `schedule` целиком, а не три ключа чипа: подпись собирает общий
    // `stepLabel`, и какие именно ключи ему нужны — его дело. Выбранные поимённо, они
    // разъехались бы с ним молча: ненайденный ключ next-intl печатает прямо в разметку
    // («editor.schedule.stepHours» вместо «каждые 2 часа»), и ровно так этот экран
    // выглядел до T198 — поймано сквозным сценарием, не сборкой и не типами.
    editor: {
      item: editorMessages["item"],
      schedule: editorMessages["schedule"],
    } as AbstractIntlMessages,
  };

  return (
    <AdminShell
      testId="library-screen"
      active="library"
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
        <div className={SPLIT_CLASS}>
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
            <NextIntlClientProvider locale={locale} messages={clientMessages}>
              <BlockEditor
                key={model.selection.id}
                blockId={model.selection.id}
                locale={locale}
                initialTitle={model.selection.title}
                initialItems={model.selection.items}
              />
            </NextIntlClientProvider>
            <UsagesCard selection={model.selection} t={t} />
          </div>
        </div>
      )}
    </AdminShell>
  );
}
