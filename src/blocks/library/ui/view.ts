// Состояние экрана библиотеки живёт в адресе: `?block=<опознаватель>` — какой блок открыт.
//
// Всё, что приходит из адреса, — ввод от кого угодно, поэтому разбирается строго
// (принцип безопасности: проверка на границе), а не подставляется в запрос как есть.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LibraryView {
  blockId?: string;
}

/** Значения параметров адреса. Next отдаёт их именно так: строка, список или ничего. */
export type SearchParams = Record<string, string | string[] | undefined>;

/** Разбирает адрес экрана. Непонятное отбрасывается молча: это не ошибка, а мусор. */
export function parseLibraryView(params: SearchParams): LibraryView {
  const raw = params["block"];
  // Повторённый параметр (`?block=a&block=b`) — попытка подсунуть неожиданное:
  // берётся первое значение, а не склеивается.
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value !== undefined && UUID_PATTERN.test(value)
    ? { blockId: value }
    : {};
}
