"use client";

// Сужение колонки списка, которое живёт в адресе и при этом не теряется (D162).
//
// Колонка мастер-детали стоит в разметке сегмента, а разметке сегмента Next параметров
// адреса не отдаёт — поэтому сужение читает клиент. Оно обязано остаться в адресе:
// ссылкой на «Кухню Алматы» делятся в чате (T075). Но и терять его на каждом шаге
// нельзя: закрытие панели, сохранение, отвязка планшета ведут на адрес элемента без
// параметров, и колонка, сбрасывающая фильтр от каждого такого перехода, «прыгала» бы
// ровно так, как владелец просил не делать.
//
// Отсюда правило: адрес, где сужение названо, — источник правды; адрес, где о нём
// ничего нет, сужения не снимает. Снять его можно только явно — пустым значением
// в адресе (поиск из левой панели шлёт `?q=`) или сбросом в самой колонке.
//
// Своё сужение колонка пишет в адрес `history.replaceState`, а не переходом Next:
// переход с новыми параметрами пересобрал бы и страницу справа, а у редактора там
// несохранённая правка. Next подхватывает смену адреса сам (`useSearchParams`
// обновляется), запроса к серверу при этом нет.
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

/** Значения сужения по имени параметра. Пустых строк здесь не бывает. */
type QueryValues = Readonly<Record<string, string>>;

function pick(
  params: URLSearchParams,
  keys: readonly string[],
): QueryValues | null {
  if (!keys.some((key) => params.has(key))) return null;
  const values: Record<string, string> = {};
  for (const key of keys) {
    // Повторённый параметр — попытка подсунуть неожиданное: берётся первое значение.
    // Значение не обрезается: поиск «Абая 44» набирается через пробел, и срезанный на
    // лету хвост не дал бы набрать второе слово. Чистит значение потребитель.
    const value = params.get(key) ?? "";
    if (value.trim() !== "") values[key] = value;
  }
  return values;
}

/** `?country=…&q=…` без пустых значений, в порядке ключей; пусто — пустая строка. */
function querySuffix(values: QueryValues, keys: readonly string[]): string {
  const query = new URLSearchParams();
  for (const key of keys) {
    const value = values[key];
    if (value !== undefined && value.trim() !== "") query.set(key, value);
  }
  const search = query.toString();
  return search === "" ? "" : `?${search}`;
}

export interface StickyQuery {
  readonly values: QueryValues;
  /** Новое сужение: сразу на экран и в адрес текущей страницы. */
  readonly update: (next: QueryValues) => void;
  /** Хвост адреса для ссылок колонки: выбор элемента сужения не снимает. */
  readonly suffix: string;
}

/**
 * Сужение в адресе окна прямо сейчас. `undefined` — окна нет (отрисовка на сервере).
 *
 * Нужно, чтобы отличить переход от эха собственной записи. После `replaceState` Next
 * доносит новый адрес до `useSearchParams` не в тот же кадр: между записью и этим
 * моментом колонка рисуется со СТАРЫМИ параметрами. Подхвати она их — сброс фильтра
 * тут же отменялся бы старым адресом, а быстро набранная буква пропадала бы. Замечено
 * сквозным сценарием: «Показать все» не показывало ничего.
 */
function locationKey(keys: readonly string[]): string | null | undefined {
  if (typeof window === "undefined") return undefined;
  const live = pick(new URLSearchParams(window.location.search), keys);
  return live === null ? null : querySuffix(live, keys);
}

export function useStickyQuery(keys: readonly string[]): StickyQuery {
  const params = useSearchParams();
  const fromUrl = pick(params, keys);
  const urlKey = fromUrl === null ? null : querySuffix(fromUrl, keys);

  const [values, setValues] = useState<QueryValues>(fromUrl ?? {});
  // Подхват адреса при рендере, а не эффектом: эффект показал бы кадр со старым
  // сужением, то есть тот самый скачок (приём «состояние из пропа» React).
  const [seen, setSeen] = useState(urlKey);
  if (urlKey !== seen) {
    const live = locationKey(keys);
    // Параметры отстают от окна — это эхо своей же записи, а не переход: ждём, пока
    // Next их донесёт, и тогда сверяемся снова.
    // Окно ещё на прежнем адресе — это переход, а не эхо: Next меняет адрес окна
    // уже ПОСЛЕ отрисовки с новыми параметрами. Без этой ветки поиск из левой панели
    // (`?q=` ссылкой) молча отбрасывался как эхо и колонка не сужалась.
    if (live === undefined || live === urlKey || live === seen) {
      setSeen(urlKey);
      if (fromUrl !== null && urlKey !== querySuffix(values, keys)) {
        setValues(fromUrl);
      }
    }
  }

  const update = useCallback(
    (next: QueryValues) => {
      setValues(next);
      const url = new URL(window.location.href);
      for (const key of keys) url.searchParams.delete(key);
      for (const [key, value] of Object.entries(next)) {
        if (value.trim() !== "") url.searchParams.set(key, value);
      }
      window.history.replaceState(null, "", url);
    },
    [keys],
  );

  return { values, update, suffix: querySuffix(values, keys) };
}
