// Ссылка из карточки на сам чек-лист в редакторе.
//
// Адрес берётся из справочника разделов `core`, а не импортом из блока `editor`: границы
// модулей запрещают ленте зависеть от редактора (.dependency-cruiser.cjs), но и своей
// копией строки он быть не должен — раздел переедет, и ссылка разъедется с боковым меню
// молча, как уже разъезжались четыре копии списка разделов (#11, T074).
import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

export function checklistHref(checklistId: string): string {
  return `${ADMIN_SECTIONS.checklists.path}/${encodeURIComponent(checklistId)}`;
}
