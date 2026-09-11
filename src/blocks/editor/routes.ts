// Адреса экранов редактора. Лежат отдельно от разметки, потому что нужны и страницам,
// и серверным действиям, и сквозным сценариям: один и тот же путь, записанный в трёх
// местах, разъезжается на первой же правке.
//
// Путь САМОГО раздела сюда не переписывается — он берётся из `core/admin-sections`, где
// живёт один на весь продукт (T091, находка #11). Здесь строятся только адреса внутри
// разделов. Сторож на это — `routes.test.ts`: равенство строк подмены не видит, пока
// раздел не переехал, а тогда узнать об этом уже поздно.
import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

export const CHECKLISTS_PATH = ADMIN_SECTIONS.checklists.path;

/** Заведение чек-листа. Статический сегмент побеждает динамический `[id]` в Next. */
export const NEW_CHECKLIST_PATH = `${CHECKLISTS_PATH}/new`;

export function checklistPath(checklistId: string): string {
  return `${CHECKLISTS_PATH}/${checklistId}`;
}

/** Предпросмотр «как это увидит сотрудник» — тот же черновик, но экраном заполнения. */
export function checklistPreviewPath(checklistId: string): string {
  return `${checklistPath(checklistId)}/preview`;
}

/** Подтверждение удаления. Отдельный экран, а не диалог: он обязан заранее сказать, что
 *  именно произойдёт — «удалить полностью» и «убрать из работы» слишком разные вещи, чтобы
 *  выясняться после нажатия. Заодно работает без JavaScript, как и остальные формы. */
export function checklistDeletePath(checklistId: string): string {
  return `${checklistPath(checklistId)}/delete`;
}

/**
 * Вставленный блок библиотеки, открытый на правку (T115). Экран библиотеки держит
 * выбранный блок в адресе (`?block=<опознаватель>`), поэтому ссылка ведёт сразу на нужный
 * блок, а не в список, где его ещё надо найти среди полусотни.
 *
 * Свой построитель, а не общий с блоком `library`: границы модулей
 * (`.dependency-cruiser.cjs`) запрещают `editor` зависеть от `library` — зависимость идёт
 * в обратную сторону. Общее здесь ровно одно — путь раздела, и он взят оттуда, где лежит
 * один на продукт. Что ссылка приводит именно к нужному блоку, проверяет не разметка,
 * а сквозной сценарий в `e2e/editor.spec.ts`: он открывает блок и читает его название.
 */
export function libraryBlockPath(blockId: string): string {
  return `${ADMIN_SECTIONS.library.path}?block=${encodeURIComponent(blockId)}`;
}
