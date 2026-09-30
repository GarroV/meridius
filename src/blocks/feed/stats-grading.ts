// Правило провала и критичности — выражениями базы, для статистики (D150, D170).
//
// Каноническое правило живёт в `data/grading.ts` (`isFailed`) и `data/severity.ts`
// (`severityOf`). Здесь его перевод на SQL, и причина у перевода одна: статистика
// считает провалы за 7 и 30 дней по целой стране, это десятки тысяч снимков, и везти их
// в процесс ради пяти чисел нельзя. Второе место правила — ровно тот дубль, который
// разъезжается молча, поэтому его держит сверка `stats-grading.test.ts`: каждый случай
// таблицы считается и кодом, и базой, и любое расхождение краснит тест.
//
// Каждое выражение возвращает true или false, но не NULL: NULL в `count(*) filter`
// выглядит как «не провален» и тихо занижал бы счёт.
import { sql, type SQL } from "drizzle-orm";

/**
 * Число из границы пункта, только если граница — число. Проверка в `case`, а не в
 * `and`: порядок вычисления `and` база не обещает, и приведение строки к числу уронило
 * бы весь запрос экрана.
 */
function beyond(item: SQL, value: SQL, bound: "min" | "max"): SQL {
  const compare = bound === "min" ? sql.raw("<") : sql.raw(">");
  return sql`(case when jsonb_typeof(${item} -> ${bound}) = 'number'
    then (${value})::numeric ${compare} (${item} -> ${bound})::numeric
    else false end)`;
}

/**
 * Провален ли ответ `value` (jsonb) на пункт `item` (jsonb). То же, что `isFailed`:
 * «нет» у да/нет, число вне заданного диапазона; текст и таблица не проваливаются.
 * Пункт без ответа сюда не попадает вовсе — его провалом не считает и код.
 */
export function itemFailedSql(item: SQL, value: SQL): SQL {
  return sql`(case
    when ${item} ->> 'type' = 'bool' then ${value} = 'false'::jsonb
    when ${item} ->> 'type' = 'number' and jsonb_typeof(${value}) = 'number'
      then (${beyond(item, value, "min")} or ${beyond(item, value, "max")})
    else false end)`;
}

/**
 * Критичен ли пункт. То же, что `severityOf(item) === "critical"`: уровень, если он
 * записан, иначе старый признак `critical` у версий, опубликованных до уровней.
 */
export function itemCriticalSql(item: SQL): SQL {
  return sql`coalesce(case
    when ${item} ? 'severity' then ${item} ->> 'severity' = 'critical'
    else ${item} -> 'critical' = 'true'::jsonb end, false)`;
}
