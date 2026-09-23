"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useScreenAwake } from "@/blocks/core/ui/use-screen-awake";

/**
 * Держит экран планшета живым: следит за перевыпуском кода и не даёт погаснуть.
 *
 * Перевыпуск (D006) делают из админки, а планшет висит на стене месяцами и никто
 * к нему не подходит. Поэтому экран сам опрашивает свой код и, увидев новый,
 * перерисовывает страницу — картинку рисует сервер, то есть на планшете и на
 * бумаге код собирается одним и тем же кодом, а не двумя похожими.
 *
 * Ничего не рисует: это поведение, а не разметка.
 */

/**
 * Как часто спрашивать про код. Десять секунд: перевыпуск делают, стоя рядом с
 * планшетом («сфотографировали наклейку — меняем»), и ждать полминуты в этот момент
 * незачем. Один опрос — несколько сотен байт, планшет в пиццерии один на станцию.
 */
const POLL_INTERVAL_MS = 10_000;

export interface LiveStationCodeProps {
  /** Адрес опроса (`/admin/qr/code?...`). */
  readonly codeHref: string;
  /** Код, с которым отрисована страница. */
  readonly code: string;
}

interface CodeAnswer {
  readonly code?: unknown;
}

export function LiveStationCode({
  codeHref,
  code,
}: LiveStationCodeProps): null {
  const router = useRouter();
  // Код в ссылке на замыкание не влияет: перерисовка приходит от сервера, а
  // сравнивать надо с тем, что показано прямо сейчас.
  const shown = useRef(code);
  shown.current = code;

  useScreenAwake();

  useEffect(() => {
    let stopped = false;

    const check = async (): Promise<void> => {
      try {
        const response = await fetch(codeHref, {
          cache: "no-store",
          // Сессия кончилась — придёт разметка входа, а не JSON: тогда просто ждём
          // следующего опроса, но код на экране не подменяем.
          headers: { accept: "application/json" },
        });
        if (!response.ok) return;

        const answer = (await response.json()) as CodeAnswer;
        const fresh = answer.code;
        if (typeof fresh !== "string" || fresh === shown.current) return;
        if (!stopped) router.refresh();
      } catch {
        // Сеть в пиццерии моргает. Молчим и ждём следующего опроса: пропавший
        // ответ ничего не говорит про код, а пустой экран сказал бы неправду.
      }
    };

    const timer = setInterval(() => {
      void check();
    }, POLL_INTERVAL_MS);
    // Первый опрос — сразу: вкладку могли открыть спустя час после перевыпуска.
    void check();

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [codeHref, router]);

  return null;
}
