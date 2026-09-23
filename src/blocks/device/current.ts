// Кто пришёл на этот запрос: привязанный планшет или кто-то без куки.
//
// Здесь склеены три вещи, которые по отдельности ничего не значат: кука, подпись и ЖИВАЯ
// строка устройства. Подпись без строки не значит ничего — отвязка из кабинета обязана
// действовать тем же мигом, а не через год, когда кука истечёт сама.
import { cookies } from "next/headers";
import { cache } from "react";

import { deviceSessionSecret } from "./config";
import type { LiveDevice } from "./devices";
import { findPairedDevice, touchDeviceSeen } from "./devices";
import {
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  DEVICE_COOKIE_NAME,
  createDeviceToken,
  readDeviceToken,
} from "./session";

/**
 * Опознаватель из куки, без похода в базу. `null` — куки нет, подпись не сошлась или
 * срок вышел.
 *
 * Нужен привязке: планшет, который привязывают заново, называет свою прежнюю строку,
 * и она снимается — иначе в списке кабинета остался бы призрак.
 */
export async function deviceIdFromCookie(now: Date): Promise<string | null> {
  const token = (await cookies()).get(DEVICE_COOKIE_NAME)?.value;
  if (token === undefined) return null;

  // Секрет читается, только когда кука есть: без секрета проверить подпись нельзя,
  // и это отказ настройки — падаем, а не считаем куку годной.
  return readDeviceToken(token, deviceSessionSecret(), now)?.deviceId ?? null;
}

/**
 * Живая привязка этого запроса — вместе со свежим кодом станции.
 *
 * Заодно отмечает «был на связи»: отметка пишется, только если прошлая старше порога,
 * поэтому просмотр чек-листа не превращается в поток записей в базу.
 *
 * Под `cache()` и без аргументов — по той же причине, что `fillLanguage` (T270): за этим
 * ответом в одном запросе приходят двое, корневая разметка (за языком документа) и сама
 * вкладка (за содержимым). Без памяти на запрос это были бы два похода в базу и две
 * отметки «был на связи»; а `now` аргументом сделал бы память бесполезной — два вызова
 * с разными мгновениями считались бы разными.
 */
export const currentDevice = cache(
  async function currentDevice(): Promise<LiveDevice | null> {
    const now = new Date();
    const deviceId = await deviceIdFromCookie(now);
    if (deviceId === null) return null;

    const device = await findPairedDevice(deviceId);
    if (device === null) return null;

    await touchDeviceSeen(device.id, now);
    return device;
  },
);

/**
 * Запоминает планшет: подписанная кука на год, `HttpOnly`, `Secure`, `SameSite=Lax`.
 *
 * `HttpOnly` — скрипт страницы куку не читает; `Secure` — она не уезжает по открытому
 * каналу (localhost браузеры считают доверенным, поэтому разработка не ломается);
 * `Lax` — переход на вкладку из чужого места не должен слать её автоматически.
 *
 * Зовётся только из серверного действия: в отрисовке страницы куки менять нельзя.
 */
export async function rememberDevice(
  deviceId: string,
  now: Date,
): Promise<void> {
  (await cookies()).set({
    name: DEVICE_COOKIE_NAME,
    value: createDeviceToken(deviceId, deviceSessionSecret(), now),
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
}
