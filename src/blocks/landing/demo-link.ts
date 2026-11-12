import type { Locale } from "@/blocks/core/locale";
import { isDemoMode } from "@/blocks/demo/mode";

/** Адрес входа в демо внутри самого продукта (включается `DEMO_MODE=1`). */
const OWN_DEMO_PATH = "/demo";

/**
 * Куда ведёт кнопка «Открыть демо», или null, когда кнопки быть не должно.
 *
 * Два источника, в таком порядке: продукт сам в режиме демо — тогда `/demo` у него
 * же; иначе `DEMO_URL` — абсолютный адрес отдельного демо-стенда (посадочная живёт на
 * рабочем адресе, демо — на другом). Ни того, ни другого — кнопки нет: мёртвая кнопка
 * выглядела бы поломкой.
 *
 * `DEMO_URL` читается при каждом запросе, а не запекается в сборку: адрес стенда
 * меняется без пересборки образа. Значение, которое не разбирается как адрес
 * http(s), считается незаданным — битая кнопка хуже отсутствующей.
 *
 * Свой `/demo` отдаётся без базового пути: ссылку рисует `Link`, а он приставляет путь
 * площадки сам. Адрес стенда — абсолютный, его `Link` не трогает.
 *
 * Язык едет параметром `lang`: человек, выбравший русский, не должен оказаться в
 * английском демо.
 */
export function demoHref(locale: Locale): string | null {
  if (isDemoMode()) return `${OWN_DEMO_PATH}?lang=${locale}`;

  const raw = process.env["DEMO_URL"]?.trim();
  if (raw === undefined || raw === "") return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.searchParams.set("lang", locale);
  return url.toString();
}
