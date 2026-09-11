// Адреса библиотеки. Отдельно от разметки, потому что нужны и странице, и серверным
// действиям, и сквозным сценариям: один и тот же путь в трёх местах разъезжается.
//
// Выбранный блок живёт в адресе, а не в памяти браузера: ссылкой можно поделиться,
// выбор переживает перезагрузку, и весь экран остаётся серверным.
import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

export const LIBRARY_PATH = ADMIN_SECTIONS.library.path;

export function libraryBlockPath(blockId: string): string {
  return `${LIBRARY_PATH}?block=${encodeURIComponent(blockId)}`;
}
