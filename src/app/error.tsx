"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import {
  STATUS_ACTION_CLASS,
  StatusCard,
  StatusScreen,
} from "@/blocks/core/ui/StatusCard";

/**
 * Граница ошибки всего продукта: что видит человек, когда экран не смог собраться.
 *
 * Заведено сверкой со спекой (T175). До неё границы не было ВОВСЕ, и недоступная база
 * давала встроенную заглушку Next: английскую, без единого слова продукта и без объяснения
 * («A server error occurred»). Методист при этом видел рабочий `/admin`, жал «Заполнения»
 * и получал белый экран — то есть отказ выглядел как поломка его компьютера.
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
    <StatusScreen>
      <StatusCard
        testId="failure"
        title={t("title")}
        text={t("text")}
        action={
          <button
            type="button"
            onClick={reset}
            className={STATUS_ACTION_CLASS}
            data-testid="failure-retry"
          >
            {t("retry")}
          </button>
        }
        note={
          error.digest === undefined ? undefined : (
            <span data-testid="failure-digest">
              {t("code")}: {error.digest}
            </span>
          )
        }
      />
    </StatusScreen>
  );
}
