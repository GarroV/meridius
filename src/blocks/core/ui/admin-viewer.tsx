"use client";

// Кто вошёл в кабинет — для меню (T344).
//
// Меню (`AdminNav`) рисуют и серверные экраны, и клиентская граница ошибки кабинета
// (`app/admin/error.tsx`), поэтому спросить вошедшего у базы само оно не может. Знает
// его разметка кабинета: она уже зовёт охрану и отдаёт сюда одну роль — ни логина, ни
// стран. Меню остаётся общим, а зависящие от роли части — два клиентских листа ниже.
//
// Это подсказка вида, а не охрана: экран «Партнёры» закрыт партнёру на сервере
// (`requireHq`), пункт меню лишь не ведёт в 404.
import {
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";

/** Роль вошедшего: управляющая компания или партнёр (D145, D169). */
export type AdminViewerRole = "hq" | "partner";

const AdminViewerContext = createContext<AdminViewerRole | null>(null);

export function AdminViewerProvider({
  role,
  children,
}: {
  readonly role: AdminViewerRole;
  readonly children: ReactNode;
}): ReactElement {
  return <AdminViewerContext value={role}>{children}</AdminViewerContext>;
}

/**
 * Показывает содержимое только УК. Роль неизвестна (разметки кабинета выше нет) —
 * не показывает: лишний пункт хуже недостающего, он ведёт в 404.
 */
export function HqOnly({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return useContext(AdminViewerContext) === "hq" ? children : null;
}

/** Подвал меню: кто вошёл. Слова отдаёт меню готовыми, как переключателям (T254). */
export function NavViewer({
  labels,
}: {
  readonly labels: {
    readonly signedIn: string;
    readonly roles: Readonly<Record<AdminViewerRole, string>>;
  };
}): ReactElement {
  const role = useContext(AdminViewerContext);
  const roleLabel = role === null ? "" : labels.roles[role];

  return (
    <div
      className="sidenav__user"
      title={roleLabel}
      data-testid="nav-viewer"
      data-role={role ?? ""}
    >
      <span className="avatar" aria-hidden="true">
        {roleLabel.slice(0, 1).toUpperCase()}
      </span>
      <span className="sidenav__who">
        <b>{labels.signedIn}</b>
        <small data-testid="nav-role">{roleLabel}</small>
      </span>
    </div>
  );
}
