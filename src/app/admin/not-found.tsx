import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { ADMIN_HOME } from "@/blocks/core/admin-sections";
import { AdminShell } from "@/blocks/core/ui/AdminShell";
import { STATUS_ACTION_CLASS, StatusCard } from "@/blocks/core/ui/StatusCard";

/**
 * Адреса нет в кабинете (T177). Ловушка `admin/[...unknown]/page.tsx` зовёт `notFound()`,
 * и до этого экрана ближайшей границей была встроенная заглушка Next: английская, без
 * меню и без шапки — то есть методист выпадал из продукта целиком.
 *
 * Экран рисуется ВНУТРИ `src/app/admin/layout.tsx`, то есть после охраны: гость сюда не
 * попадает — он раньше уходит на форму входа, и перебор адресов по-прежнему не
 * рассказывает, какие разделы существуют.
 *
 * У `/admin/feed/<чужой id>` свой такой экран уже был (`feed/ui/SubmissionNotFound`) —
 * приём в проекте освоен, здесь он распространён на общий случай.
 */
export default async function AdminNotFoundPage(): Promise<ReactElement> {
  const t = await getTranslations("admin.notFound");
  const admin = await getTranslations("admin");

  return (
    <AdminShell
      testId="admin-not-found"
      narrow
      breadcrumb={
        <Link href={ADMIN_HOME.path} className="underline">
          {admin("crumbs")}
        </Link>
      }
      // В шапке — своё слово: не заголовок карточки и не крошка. Шапка, повторившая
      // соседа, печатала «Кабинет» дважды подряд (T251) — одно и то же слово рядом
      // читается как сбой вёрстки. Обычный кабинетный приём — крошка и заголовок
      // разными словами (`/admin/library`: «Работа» и «Библиотека блоков»).
      title={t("topbar")}
      topbarAction={null}
    >
      <StatusCard
        testId="admin-not-found-card"
        title={t("title")}
        text={t("text")}
        action={
          <Link
            href={ADMIN_HOME.path}
            className={STATUS_ACTION_CLASS}
            data-testid="admin-not-found-home"
          >
            {t("action")}
          </Link>
        }
      />
    </AdminShell>
  );
}
