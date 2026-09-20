import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { isLocale, pickLocale, type Locale } from "@/blocks/core/locale";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

const MESSAGES: Record<Locale, typeof en> = { en, ru };

// next-intl без маршрутизации локали: язык берётся из заголовка Accept-Language на
// каждом запросе.
//
// КРОМЕ случая, когда язык назвали явно — `getTranslations({ locale })`. Так спрашивает
// поверхность, чей язык принадлежит не тому, кто её открыл: наклейку станции печатает
// методист из своего браузера, а висит она на кухне пиццерии и говорит её языком
// (D122, T273). Имя языка next-intl передаёт сюда параметром `locale` — и не прочитать
// его значит тихо отдать словарь по заголовку запроса, то есть ровно тот, от которого
// зовущий и уходил. Сам next-intl о таком расхождении молчит: `validateLocale` сверяет
// только формат метки, а не то, что вернули запрошенный язык.
//
// Чужая метка сюда доехать не может (язык называет наш же код, а не адрес или заголовок),
// но проверяется она всё равно: `MESSAGES` индексируется этим значением, и неизвестная
// метка дала бы `undefined` вместо словаря — то есть страницу без единой надписи.
export default getRequestConfig(async ({ locale: requested }) => {
  const locale: Locale = isLocale(requested)
    ? requested
    : pickLocale((await headers()).get("accept-language"));
  return { locale, messages: MESSAGES[locale] };
});
