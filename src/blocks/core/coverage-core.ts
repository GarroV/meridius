/**
 * Что считается ядром — машиночитаемо, и это КАНОН (D101, D139).
 *
 * До 23.09.2026 список ядра жил прозой в `docs/furca/constitution.md`, а порог
 * покрытия мерил весь продукт целиком. Два следствия, оба плохие:
 *
 * 1. Гейт краснел на правильной работе. Обвязка (экраны, `ui/`, серверные действия)
 *    по стандарту проекта проверяется живым запуском, а не модульным тестом, — значит
 *    каждый блок с интерфейсом добавлял непокрытые строки и заворачивал приёмку.
 *    Замер на блоке `device`: из 376 непокрытых строк 230 — обвязка, и никакой тест
 *    там не нужен. Гейт, краснеющий на успехе, обучает двигать базу вниз.
 * 2. Список ядра прозой не мог быть проверен машиной, а значит расходился молча:
 *    новый файл с расчётом прав никто в прозу не вписывал.
 *
 * Поэтому список живёт здесь, а `constitution.md` на него ссылается. Один факт — одно
 * место; вторая копия списка была бы ровно тем дублем, который через месяц разъедется.
 *
 * ПРИЗНАК ЯДРА — НЕ ВАЖНОСТЬ КОДА, А ТО, МОЛЧИТ ЛИ ЕГО СБОЙ. Расчёт, деньги, права
 * доступа: неверный результат доедет до человека и сойдёт за верный. Обвязка кричит на
 * первом же запуске — её держат сквозные сценарии, которых у продукта 292.
 */

/** Каталоги, которые относятся к ядру целиком. */
const CORE_DIRECTORIES = [
  // Предметные правила и форма данных: неверная оценка или не та версия чек-листа
  // выглядят ровно как верные.
  "src/blocks/data/",
] as const;

/**
 * Отдельные файлы ядра. Перечислены поимённо, а не каталогом: рядом с ними в тех же
 * блоках лежит обвязка, и «весь блок целиком» записал бы в ядро экраны.
 */
const CORE_FILES = [
  // Отказ, который не сработал, неотличим от успеха. По замеру системы права дают
  // самую крупную долю дефектов, прорывающихся мимо тестов.
  "src/blocks/auth/guard.ts",
  "src/blocks/auth/session.ts",
  "src/blocks/auth/password.ts",
  "src/blocks/auth/rate-limit.ts",
  "src/blocks/auth/attempt-store.ts",

  // Что засчитано и когда просрочено.
  "src/blocks/fill/answers.ts",
  "src/blocks/fill/validation.ts",
  "src/blocks/fill/submit.ts",
  "src/blocks/fill/repeat.ts",
  "src/blocks/fill/overdue.ts",
  "src/blocks/fill/alarms.ts",
  "src/blocks/fill/alarm-limits.ts",
  "src/blocks/fill/rounds.ts",
  "src/blocks/fill/shift-mode.ts",
  "src/blocks/fill/ticket.ts",

  // Разбор вставленного, публикация версии, связи с библиотекой.
  "src/blocks/editor/paste.ts",
  "src/blocks/editor/publish.ts",
  "src/blocks/editor/validation.ts",
  "src/blocks/editor/duplicate.ts",
  "src/blocks/editor/library-links.ts",
  "src/blocks/editor/removal.ts",
  "src/blocks/editor/schedule-field.ts",
  "src/blocks/editor/table-field.ts",
  "src/blocks/editor/window-field.ts",

  "src/blocks/library/blocks.ts",
  "src/blocks/library/parsing.ts",
  "src/blocks/library/usages.ts",
  // Единственный файл под `ui/` в ядре: считает расписание пункта, а не рисует его.
  "src/blocks/library/ui/item-schedule.ts",

  // Сторожа, которые сами обязаны краснеть.
  "src/blocks/core/stand.ts",
  "src/blocks/core/coverage-gate.ts",
  "src/blocks/core/coverage-core.ts",
  "src/blocks/core/design-reference.ts",
  "src/blocks/core/public-routes.ts",
  "src/blocks/core/base-path.ts",
  // Подпись обеих кук продукта: подделанная подпись, принятая за свою, молчит.
  "src/blocks/core/signed-token.ts",

  // Привязка планшета (D132, D133): строка в базе И ЕСТЬ право планшета показывать
  // чек-лист, а предел частоты — единственное, что стоит между четырьмя цифрами и
  // чужой станцией. Сбой здесь молчит: не сработавший отказ выглядит как успех.
  "src/blocks/device/session.ts",
  "src/blocks/device/pairing.ts",
  "src/blocks/device/devices.ts",
  "src/blocks/device/pair.ts",
  "src/blocks/device/rate-limit.ts",
  "src/blocks/device/current.ts",
  "src/blocks/device/pin.ts",
  "src/blocks/device/config.ts",
  "src/blocks/device/windows.ts",
  "src/blocks/device/params.ts",
] as const;

/** Тесты в покрытии не участвуют: они и есть проверка, а не проверяемое. */
function isTest(path: string): boolean {
  return /\.(test|spec)\.[cm]?tsx?$/.test(path);
}

/**
 * Относится ли файл к ядру. Путь ожидается относительный от корня репозитория и с
 * прямыми слэшами — приведение делает вызывающий (`scripts/coverage-gate.mjs`).
 */
export function isCoreFile(path: string): boolean {
  if (isTest(path)) return false;
  if (CORE_FILES.includes(path as (typeof CORE_FILES)[number])) return true;
  return CORE_DIRECTORIES.some((directory) => path.startsWith(directory));
}

/**
 * Все поимённо названные файлы ядра — чтобы гейт мог сказать, если какой-то из них
 * ПРОПАЛ ИЗ ОТЧЁТА. Файл ядра, которого в отчёте нет вовсе, означает, что его не
 * коснулся ни один тест, а выглядит это как «непокрытых не прибавилось».
 */
export const CORE_FILE_LIST: readonly string[] = CORE_FILES;
