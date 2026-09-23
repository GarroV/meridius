// Привязка планшета: что происходит, когда на планшете ввели четыре цифры.
//
// Порядок проверок тот же, что у отправки заполнения: форма тела (дёшево, без базы),
// потом частота (тоже без базы), и только затем база. Иначе перебор гонял бы базу.
import { headers } from "next/headers";

import { rememberDevice, deviceIdFromCookie } from "./current";
import { pairDevice } from "./devices";
import { consumePairingPin } from "./pairing";
import { isPin } from "./pin";
import { checkPairAllowed, pairClientKey } from "./rate-limit";

/**
 * Чем кончилась попытка.
 *
 * Отказ ОДИН на все случаи негодного кода: истёк, неверен, уже съеден. Разные тексты
 * рассказали бы подбору, какой код существует, — а это ровно та подсказка, ради которой
 * перебор и затевают.
 */
export type PairOutcome =
  | { readonly kind: "paired" }
  | { readonly kind: "refused" }
  | { readonly kind: "tooOften"; readonly retryAfterSeconds: number }
  | { readonly kind: "broken" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Привязывает планшет по введённому пину.
 *
 * Тело действия вызывает кто угодно, а не только наша форма: всё проверяется здесь, на
 * границе. Прежняя привязка ЭТОГО планшета снимается тем же движением — иначе в списке
 * кабинета остался бы призрак, к которому уже никто не придёт.
 */
export async function pairTablet(
  input: unknown,
  now: Date,
): Promise<PairOutcome> {
  const code = isRecord(input) ? input["code"] : undefined;
  const typed = typeof code === "string" ? code.trim() : "";

  // Частота считается и на заведомо негодной форме кода: иначе перебор ходил бы мимо
  // счётчика, отправляя мусор, и предел не значил бы ничего.
  const client = pairClientKey(
    (await headers()).get("x-forwarded-for"),
    process.env,
  );
  const verdict = checkPairAllowed(client, now);
  if (!verdict.allowed) {
    return { kind: "tooOften", retryAfterSeconds: verdict.retryAfterSeconds };
  }

  if (!isPin(typed)) return { kind: "refused" };

  const pin = await consumePairingPin(typed, now);
  if (pin === null) return { kind: "refused" };

  const previousDeviceId = await deviceIdFromCookie(now);
  const device = await pairDevice(
    { stationId: pin.stationId, previousDeviceId },
    now,
  );
  await rememberDevice(device.id, now);

  return { kind: "paired" };
}
