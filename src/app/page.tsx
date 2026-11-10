import { redirect } from "next/navigation";

import { hasAdminSession } from "@/blocks/auth/guard";
import { ADMIN_HOME_PATH } from "@/blocks/auth/routes";
import { redirectPath } from "@/blocks/core/base-path";
import { isLocale } from "@/blocks/core/locale";

/** Адрес посадочной (D193); сам маршрут — `src/app/welcome/`. */
const WELCOME_PATH = "/welcome";

// Корень продукта разводит двоих. Вошедший идёт в кабинет, как и раньше. Анонимному
// корень ничего не показывает — отправляет на посадочную, сохраняя явно названный
// язык (`?lang=`): без него ссылка «по-русски» с корня теряла бы выбор.
//
// Показать язык, выбранный настройкой браузера, без куки (сценарий кухни,
// `e2e/locale.spec.ts`) теперь обязана посадочная, а не корень.
export default async function RootPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await hasAdminSession()) redirect(redirectPath(ADMIN_HOME_PATH));

  const { lang } = await searchParams;
  const query =
    typeof lang === "string" && isLocale(lang) ? `?lang=${lang}` : "";
  redirect(redirectPath(`${WELCOME_PATH}${query}`));
}
