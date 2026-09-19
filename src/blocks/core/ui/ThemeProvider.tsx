"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  resolvedTheme,
  THEME_ATTRIBUTE,
  themeCookie,
  type ThemeChoice,
} from "../theme";

/**
 * Выбор темы, известный клиентской стороне.
 *
 * Зачем контекст, а не чтение куки самим переключателем: куку читает сервер и рисует
 * страницу уже в нужной теме, а переключатель обязан показать ТОТ ЖЕ выбор с первого
 * кадра. Прочитай он её сам — на сервере `document` нет, и разметка приехала бы с
 * подсвеченным «Авто», которое через миг перескакивало бы на настоящий выбор.
 */
interface ThemeChoiceState {
  readonly choice: ThemeChoice;
  readonly choose: (next: ThemeChoice) => void;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Ставит на `<html>` тот же атрибут, что поставил бы сервер или скрипт довключения. */
function applyChoice(choice: ThemeChoice): void {
  const root = globalThis.document.documentElement;
  const explicit = resolvedTheme(choice);
  const theme =
    explicit ??
    (globalThis.matchMedia(DARK_QUERY).matches ? "dark" : undefined);
  if (theme === undefined) root.removeAttribute(THEME_ATTRIBUTE);
  else root.setAttribute(THEME_ATTRIBUTE, theme);
}

/**
 * Умолчание — рабочее, а не пустое: переключатель может оказаться на экране отказа
 * кабинета, который рисуется мимо обычного дерева. Пусть он там не знает сохранённого
 * выбора (покажет «Авто»), но переключает по-настоящему; бросить исключение значило бы
 * уронить как раз тот экран, который и показывается, когда всё остальное уже упало.
 */
const ThemeChoiceContext = createContext<ThemeChoiceState>({
  choice: "system",
  choose: applyChoice,
});

export function useThemeChoice(): ThemeChoiceState {
  return useContext(ThemeChoiceContext);
}

export interface ThemeProviderProps {
  /** Выбор из куки, прочитанный на сервере. */
  readonly choice: ThemeChoice;
  readonly children: ReactNode;
}

export function ThemeProvider({
  choice,
  children,
}: ThemeProviderProps): ReactElement {
  const [current, setCurrent] = useState<ThemeChoice>(choice);

  const choose = useCallback((next: ThemeChoice) => {
    setCurrent(next);
    // Кука — на весь продукт, а не на раздел: следующая страница должна открыться
    // в выбранной теме сразу с сервера, без мигания.
    globalThis.document.cookie = themeCookie(next);
    applyChoice(next);
  }, []);

  // Человек переключил тему в системе, пока страница открыта. Это не редкость, а
  // ровно тот сценарий, из-за которого тема и заведена: смена идёт с вечера в ночь,
  // и телефон переключается сам посреди заполнения чек-листа.
  useEffect(() => {
    if (current !== "system") return;
    const media = globalThis.matchMedia(DARK_QUERY);
    const sync = (): void => {
      applyChoice("system");
    };
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
    };
  }, [current]);

  const state = useMemo<ThemeChoiceState>(
    () => ({ choice: current, choose }),
    [current, choose],
  );

  return <ThemeChoiceContext value={state}>{children}</ThemeChoiceContext>;
}
