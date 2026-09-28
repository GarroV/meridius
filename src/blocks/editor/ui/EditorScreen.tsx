import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Icon } from "@/blocks/core/ui/Icon";

import { submitDuplicate } from "../actions";
import { loadEditor } from "../drafts";
import { listStations } from "../listing";
import { pickEditorText } from "../localized-text";
import { checklistDeletePath, checklistPreviewPath } from "../routes";
import type { WindowValue } from "../window-field";
import { ChecklistEditor } from "./ChecklistEditor";

/** Время базы «06:00:00» на экране показывается и правится как «06:00». */
function toFormTime(value: string): string {
  return value.slice(0, 5);
}

function windowOf(start: string, end: string): WindowValue {
  return { start: toFormTime(start), end: toFormTime(end) };
}

/**
 * Дублировать и удалить — иконками рядом с публикацией, как действия в шапке панели
 * Swarm (D164). Удаление ведёт не сразу в действие, а в подтверждение панелью справа:
 * последствие зависит от истории заполнений, и назвать его надо до нажатия.
 * У шаблона их нет: его жизненный цикл ведёт раздел «Шаблоны» (T309).
 */
function ChecklistActions({
  checklistId,
  duplicateLabel,
  deleteLabel,
}: {
  readonly checklistId: string;
  readonly duplicateLabel: string;
  readonly deleteLabel: string;
}) {
  return (
    <>
      <form action={submitDuplicate}>
        <input type="hidden" name="checklistId" value={checklistId} />
        <button
          type="submit"
          data-testid="duplicate-checklist"
          className="icon-btn"
          aria-label={duplicateLabel}
          title={duplicateLabel}
        >
          <Icon name="doc" />
        </button>
      </form>
      <Link
        href={checklistDeletePath(checklistId)}
        scroll={false}
        data-testid="delete-checklist"
        className="icon-btn icon-btn--danger"
        aria-label={deleteLabel}
        title={deleteLabel}
      >
        <Icon name="trash" />
      </Link>
    </>
  );
}

/**
 * Экран редактора. Данные читаются на сервере одним заходом, дальше правка идёт в браузере
 * и уходит обратно двумя действиями — «сохранить черновик» и «опубликовать».
 *
 * Тексты редактора отдаются в браузер провайдером next-intl: клиентская часть большая
 * и с числительными («4 пункта», «используется ещё в 6 чек-листах»), а склонять их
 * пробросом готовых строк нельзя — количество меняется прямо на экране. Провайдер
 * ставит рабочее место раздела (`ChecklistsWorkspace`): словарь редактора нужен и
 * колонке, а два провайдера отправили бы его в браузер дважды.
 */
export async function EditorScreen({
  checklistId,
  stationAction,
}: {
  readonly checklistId: string;
  /**
   * Действие кабинета, которому нужна СОХРАНЁННАЯ станция чек-листа, — сейчас это
   * «Привязать планшет» блока `device`. Приходит готовой разметкой от страницы, а не
   * импортом: правило границ не даёт редактору зависеть от блока привязки, а второй
   * поход в базу за станцией ради одной карточки был бы лишним.
   */
  readonly stationAction?: (stationId: string | null) => React.ReactNode;
}) {
  const state = await loadEditor(checklistId);
  if (state === null) notFound();

  const [locale, stations, t] = await Promise.all([
    getLocale(),
    listStations(),
    getTranslations("editor"),
  ]);

  const highestVersion = state.versions.reduce(
    (highest, version) => Math.max(highest, version.versionNumber ?? 0),
    0,
  );

  // Шаблон правится тем же редактором, но живёт своим разделом (T309): и меню, и путь
  // над заголовком ведут туда, откуда его открыли.
  const isTemplate = state.checklist.isTemplate;
  const crumbs = [
    isTemplate ? t("screen.crumbsTemplates") : t("screen.crumbsRoot"),
    state.station?.countryName,
    state.station?.storeName,
    state.station?.name,
  ]
    .filter((part) => part !== undefined && part !== "")
    .join(" · ");

  /*
    Рабочая зона раздела (D162): меню и колонку чек-листов рисует разметка сегмента
    (`ChecklistsWorkspace`), а редактор — только правую часть. Верхнюю полосу он
    собирает сам: кнопки публикации живут внутри клиентской формы и обязаны видеть
    её состояние.
  */
  return (
    <div data-testid="editor-screen" className="flex min-w-0 flex-col">
      <ChecklistEditor
        checklistId={checklistId}
        locale={locale}
        initialTitle={pickEditorText(state.checklist.title, locale)}
        initialStationId={state.checklist.stationId ?? ""}
        isTemplate={isTemplate}
        initialWindow={windowOf(
          state.checklist.windowStart,
          state.checklist.windowEnd,
        )}
        initialSections={state.sections}
        stations={stations}
        station={state.station}
        versions={state.versions}
        library={state.library}
        nextVersionNumber={highestVersion + 1}
        previewHref={checklistPreviewPath(checklistId)}
        crumbs={crumbs}
        stationAction={stationAction?.(state.checklist.stationId ?? null)}
        headerActions={
          isTemplate ? null : (
            <ChecklistActions
              checklistId={checklistId}
              duplicateLabel={t("list.duplicate")}
              deleteLabel={t("list.delete")}
            />
          )
        }
      />
    </div>
  );
}
