// Состояние форм экрана «Партнёры». Отдельно от действий: файл с "use server" вправе
// экспортировать только асинхронные функции.

/** Почему форма не прошла. Текст выбирает экран по коду: он двуязычный. */
export type PartnerFormError =
  | "tenant-name"
  | "hq-tenant"
  | "no-countries"
  | "unknown-country"
  | "root-login"
  | "login-shape"
  | "login-taken"
  | "short-password"
  | "not-found"
  | "removed"
  | "unknown";

export interface PartnerFormState {
  readonly status: "idle" | "done" | "failed";
  readonly error?: PartnerFormError;
  /** Логин, над которым сделано действие: подтверждение называет его. */
  readonly login?: string;
  /**
   * Новый пароль после сброса. Показывается один раз, в ответе на само действие: в базе
   * лежит только хэш, и второй раз показать его нечем.
   */
  readonly password?: string;
}

export const INITIAL_PARTNER_FORM: PartnerFormState = { status: "idle" };
