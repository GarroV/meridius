"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { STATE_ACTION_CLASS, StateScreen } from "@/blocks/core/ui/StateScreen";

/**
 * Граница ошибки публичной стороны: что видит человек, когда экран не смог собраться.
 *
 * Заведено сверкой со спекой (T175). До неё границы не было ВОВСЕ, и недоступная база
 * давала встроенную заглушку Next: английскую, без единого слова продукта и без объяснения
 * («A server error occurred»). Методист при этом видел рабочий `/admin`, жал «Заполнения»
 * и получал белый экран — то есть отказ выглядел как поломка его компьютера.
 *
 * Кабинет сюда БОЛЬШЕ НЕ ПОПАДАЕТ: у него своя граница `src/app/admin/error.tsx`, которая
 * рисует отказ внутри каркаса (T215). Здесь остаётся сотрудническая поверхность — экран
 * заполнения на кухонном телефоне, — и вид у состояния её собственный: полный экран,
 * крупный заголовок, акцентная кнопка во всю ширину (T213).
 *
 * Отказ окрашен: объяснение стоит в плашке цвета ошибки (`.notice--err` эталона), а не
 * тем же нейтральным серым, что «здесь пока пусто» (T214). Сотрудник по одному взгляду
 * отличает «сломалось, попробуй ещё» от «заполнять сейчас нечего».
 *
 * Что здесь сознательно НЕ показано: сообщение самой ошибки. Next в продакшене его и не
 * отдаёт клиенту, и это правильно — текст ошибки базы рассказывает про схему и адреса.
 * Наружу идёт только `digest`: тот же код печатается в журнале сервера рядом с полным
 * разбором, поэтому по нему человек и тот, кто держит сервис, говорят об одном событии.
 *
 * Граница обязана быть клиентской — требование Next. Поэтому тексты берутся из словаря
 * через `NextIntlClientProvider`, который ставит корневая разметка: серверные
 * `getTranslations` здесь недоступны.
 */
export default function ProductError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}): ReactElement {
  const t = useTranslations("failure");

  return (
    <StateScreen
      testId="failure"
      tone="plain"
      title={t("title")}
      notice={t("text")}
      noticeTone="err"
      action={
        <button
          type="button"
          onClick={reset}
          className={STATE_ACTION_CLASS}
          data-testid="failure-retry"
        >
          {t("retry")}
        </button>
      }
      {...(error.digest === undefined
        ? {}
        : {
            note: (
              <span data-testid="failure-digest">
                {t("code")}: {error.digest}
              </span>
            ),
          })}
    />
  );
}
