// Выбор режима смены с публичной ссылки станции (D052, D055).
//
// Гейта на это действие нет сознательно: менеджер, у которого нет ни телефона в
// рабочей зоне, ни времени, ставит режим тем же движением, которым сканирует
// наклейку. Удерживает от привычки сокращать чек-лист каждый день не запрет, а то,
// что каждая перестановка остаётся в истории и видна управляющему.
//
// Порядок проверок тот же, что у отправки: форма тела (дёшево, без базы), потом
// частота (тоже без базы), и только затем база.
import type { ShiftMode } from "@/blocks/data";
import { isShiftMode, setShiftMode } from "@/blocks/data";

import { checkShiftModeAllowed } from "./rate-limit";
import { isPlausibleCode } from "./params";
import { storeIdForCode } from "./station";

/**
 * Верхняя граница на число людей в смене. Это не бизнес-правило, а заслон от
 * мусора: подпись «2 из 4» существует, чтобы управляющий понял причину, и
 * «100000 из 4» её не несёт. Смена пиццерии — единицы человек.
 */
const MAX_STAFF = 999;

// Не выставляется наружу: наружу выходят `ParsedShiftModeChoice` и `ShiftModeOutcome`,
// а причина отказа читается через них.
type ShiftModeRefusal = "malformed" | "unknown-code" | "rate-limited";

interface ShiftModeChoice {
  readonly code: string;
  readonly mode: ShiftMode;
  readonly staffPresent: number | undefined;
  readonly staffExpected: number | undefined;
}

export type ParsedShiftModeChoice =
  | { readonly ok: true; readonly value: ShiftModeChoice }
  | { readonly ok: false; readonly reason: ShiftModeRefusal };

export type ShiftModeOutcome =
  | { readonly kind: "set"; readonly mode: ShiftMode }
  | {
      readonly kind: "refused";
      readonly reason: ShiftModeRefusal;
      readonly retryAfterSeconds: number;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Число людей в смене. Испорченное значение отбрасывается, а не роняет выбор:
 * подпись о причине необязательна, и кухня не должна встать из-за неё.
 */
function parseStaff(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" && typeof value !== "string") return undefined;

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return undefined;
  if (parsed < 0 || parsed > MAX_STAFF) return undefined;
  return parsed;
}

/** Разбор тела действия. Всё, что не той формы, — один отказ без подробностей. */
export function parseShiftModeChoice(input: unknown): ParsedShiftModeChoice {
  if (!isRecord(input)) return { ok: false, reason: "malformed" };

  const code = input["code"];
  if (typeof code !== "string" || !isPlausibleCode(code)) {
    return { ok: false, reason: "malformed" };
  }

  const mode = input["mode"];
  if (!isShiftMode(mode)) return { ok: false, reason: "malformed" };

  return {
    ok: true,
    value: {
      code,
      mode,
      staffPresent: parseStaff(input["staffPresent"]),
      staffExpected: parseStaff(input["staffExpected"]),
    },
  };
}

/**
 * Ставит режим смены пиццерии, которой принадлежит станция этого кода.
 *
 * Неизвестный и перевыпущенный код дают один отказ: различать их значило бы
 * отвечать перебору по-разному (D021).
 */
export async function chooseShiftMode(
  input: unknown,
  now: Date,
): Promise<ShiftModeOutcome> {
  const parsed = parseShiftModeChoice(input);
  if (!parsed.ok) {
    return { kind: "refused", reason: parsed.reason, retryAfterSeconds: 0 };
  }

  const { code, mode, staffPresent, staffExpected } = parsed.value;

  const rate = checkShiftModeAllowed(code, now);
  if (!rate.allowed) {
    return {
      kind: "refused",
      reason: "rate-limited",
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }

  const storeId = await storeIdForCode(code);
  if (storeId === null) {
    return { kind: "refused", reason: "unknown-code", retryAfterSeconds: 0 };
  }

  const state = await setShiftMode(
    { storeId, mode, staffPresent, staffExpected },
    now,
  );
  if (state === null) {
    return { kind: "refused", reason: "unknown-code", retryAfterSeconds: 0 };
  }

  return { kind: "set", mode: state.mode };
}
