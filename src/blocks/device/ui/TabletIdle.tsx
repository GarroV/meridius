"use client";

import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { formatDuration } from "@/blocks/core/duration";

/**
 * Отсчёт до открытия следующего окна на отбивке «сейчас заполнять нечего».
 *
 * Планшет висит на стене открытым, и без отсчёта отбивка выглядит одинаково и за минуту
 * до открытия, и за восемь часов до него: сотрудник не знает, ждать ему или идти к
 * управляющему. Саму перерисовку в момент открытия делают часы вкладки (`TabletExtras`),
 * здесь только показ.
 */

const TICK_MS = 1000;
const MILLISECONDS = 1000;

/**
 * Место для оставшегося времени внутри переведённой подписи.
 *
 * Подпись приходит СТРОКОЙ, а не готовой функцией: функцию серверный компонент клиентскому
 * передать не может, а разрывать фразу на «до» и «после» значило бы закрепить порядок слов
 * русского языка в коде. Поэтому сервер подставляет сюда саму метку, а вкладка делит по ней
 * строку и вставляет живой отсчёт.
 */
export const LEFT_PLACEHOLDER = "{left}";

export function TabletIdle({
  opensInSeconds,
  label,
}: {
  readonly opensInSeconds: number;
  /** Переведённая подпись с меткой `{left}` на месте оставшегося времени. */
  readonly label: string;
}): ReactElement {
  const [left, setLeft] = useState(opensInSeconds);

  // Отсчёт ведётся от величины, посчитанной сервером: часы планшета врут, а окно задано
  // местным временем пиццерии (D026). Вкладка только уменьшает эту величину.
  useEffect(() => {
    setLeft(opensInSeconds);
    const timer = setInterval(() => {
      setLeft((current) => Math.max(0, current - 1));
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [opensInSeconds]);

  const [before = "", after = ""] = label.split(LEFT_PLACEHOLDER);

  return (
    <span data-testid="tablet-opens-in">
      {before}
      {formatDuration(left * MILLISECONDS)}
      {after}
    </span>
  );
}
