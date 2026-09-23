"use client";

import { useEffect } from "react";

/**
 * Держит экран планшета живым, пока вкладка видна.
 *
 * Написан был для полноэкранного QR (`qr/ui/LiveStationCode.tsx`) и переехал сюда, когда
 * тех же рук потребовала привязанная вкладка станции: гаснущая подсветка означает, что
 * сотрудник сначала будит планшет, потом работает. Две копии этого эффекта разъехались бы
 * молча — одна перестала бы возвращать блокировку после сворачивания вкладки, и заметить
 * это можно было бы только у стены на кухне.
 *
 * Отсутствие Wake Lock в браузере экран НЕ ломает: страница живёт как жила, просто планшет
 * гасит подсветку своим таймером. Это не проглоченная ошибка — поведения продукта здесь
 * нет вовсе, есть просьба к браузеру, которую он вправе не выполнить.
 */
export function useScreenAwake(): void {
  useEffect(() => {
    // Браузер без Wake Lock (или запрет политикой) — не повод ломать экран.
    if (!("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let dropped = false;

    const acquire = async (): Promise<void> => {
      if (dropped || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Отказ бывает штатным: свёрнутая вкладка, экономия батареи.
        sentinel = null;
      }
    };

    // Блокировка снимается сама, когда вкладку скрывают, — и не возвращается сама.
    const onVisible = (): void => {
      void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, []);
}
