// Шаг обхода словами: «каждые 2 ч», «каждые 30 минут».
//
// Отдельным файлом, потому что подпись нужна двум экранам сразу — окну настройки в
// строке пункта (клиентская разметка) и предпросмотру (серверная). Написанная дважды,
// она разошлась бы молча: на одном экране «2 часа», на другом «120 минут», и методист
// решил бы, что видит две разные настройки.
//
// Переводчик приходит снаружи, а не берётся здесь: `useTranslations` и
// `getTranslations` — разные входы одного словаря, и выбирать между ними должен тот,
// кто рисует, а не тот, кто считает часы.

/**
 * Вызов словаря в том виде, в каком его умеют оба входа `next-intl`. Ключи берутся из
 * раздела `editor.schedule`, то есть переводчик обязан быть привязан именно к нему.
 */
export type StepTranslate = (
  key: string,
  values?: Record<string, number | string>,
) => string;

const MINUTES_IN_HOUR = 60;

/**
 * Часы и минуты — два отдельных ключа словаря, потому что оба числительных склоняются,
 * а склеивать их в одну строку кода значит писать русскую грамматику в TypeScript.
 */
export function stepLabel(everyMinutes: number, t: StepTranslate): string {
  const hours = Math.floor(everyMinutes / MINUTES_IN_HOUR);
  const minutes = everyMinutes % MINUTES_IN_HOUR;
  if (hours === 0) return t("stepMinutes", { count: minutes });
  if (minutes === 0) return t("stepHours", { count: hours });
  return `${t("stepHours", { count: hours })} ${t("stepMinutes", { count: minutes })}`;
}
