"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { ADMIN_HOME } from "@/blocks/core/admin-sections";
import { AdminShell } from "@/blocks/core/ui/AdminShell";
import { STATUS_ACTION_CLASS, StatusCard } from "@/blocks/core/ui/StatusCard";

/**
 * Отказ ВНУТРИ кабинета (T215). До этого экрана границы у кабинета не было вовсе: любая
 * страница, не получившая данных, проваливалась на общую границу `src/app/error.tsx` —
 * то есть методист при недоступной базе терял меню и шапку и оказывался на экране,
 * похожем на публичную сторону, тогда как соседний отказ «такого раздела нет» каркас
 * сохранял. В эталоне оболочка кабинета не исчезает ни в одном состоянии.
 *
 * Почему каркас рисуется здесь, а не достаётся от разметки: `src/app/admin/layout.tsx`
 * держит только охрану, а меню и шапку ставит каждый экран сам (`AdminShell`) — у них
 * разные заголовок, крошка и действие в полосе. Граница ошибки — такой же экран, и
 * каркас ставит так же.
 *
 * Отказ окрашен плашкой цвета ошибки (`.notice--err` эталона, блок «Ошибка сохранения»),
 * а не нейтральным серым пустого состояния (T214): «не удалось получить данные» и
 * «данных пока нет» — разные новости, и отличать их человек должен не по тексту.
 *
 * Наружу, как и на публичной границе, идёт только `digest` — код, по которому событие
 * ищется в журнале сервера. Сообщение ошибки базы рассказывает про схему и адреса.
 */
export default function AdminError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}): ReactElement {
  const t = useTranslations("failure");
  const admin = useTranslations("admin");

  return (
    <AdminShell
      testId="admin-failure"
      narrow
      breadcrumb={
        <Link href={ADMIN_HOME.path} className="underline">
          {admin("crumbs")}
        </Link>
      }
      // В шапке — название кабинета, а не заголовок карточки: один и тот же текст дважды
      // подряд читается как сбой вёрстки (тот же приём, что у «такого раздела нет»).
      title={admin("crumbs")}
      topbarAction={null}
    >
      <StatusCard
        testId="admin-failure-card"
        title={t("title")}
        notice={t("text")}
        action={
          <button
            type="button"
            onClick={reset}
            className={STATUS_ACTION_CLASS}
            data-testid="admin-failure-retry"
          >
            {t("retry")}
          </button>
        }
        {...(error.digest === undefined
          ? {}
          : {
              note: (
                <span data-testid="admin-failure-digest">
                  {t("code")}: {error.digest}
                </span>
              ),
            })}
      />
    </AdminShell>
  );
}
