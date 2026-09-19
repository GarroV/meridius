import { describe, expect, it } from "vitest";

import { nonceFromPolicy, securityHeaders } from "./security-headers";

/** Политика так, как её собирает сам продукт: пример не переписан от руки. */
function policyWith(nonce: string | undefined): string {
  const header = securityHeaders({ nonce, isDevelopment: false }).find(
    (one) => one.key === "Content-Security-Policy",
  );
  if (header === undefined) throw new Error("политики в наборе нет");
  return header.value;
}

describe("nonceFromPolicy", () => {
  // Круг замыкается на настоящей политике: разойдись запись с чтением — инлайновый
  // скрипт темы отобьётся браузером молча, и кухонный экран останется светлым.
  it("достаёт ключ из политики, которую сам продукт и составил", () => {
    expect(nonceFromPolicy(policyWith("dGVzdA=="))).toBe("dGVzdA==");
  });

  it("политика без ключа — и доставать нечего", () => {
    expect(nonceFromPolicy(policyWith(undefined))).toBeUndefined();
  });

  it("политики нет вовсе", () => {
    expect(nonceFromPolicy(null)).toBeUndefined();
    expect(nonceFromPolicy(undefined)).toBeUndefined();
  });

  // Ключ берётся из `script-src`, а не из первой подходящей скобки в строке:
  // в политике есть и другие источники, и чужой ключ пустил бы в страницу скрипт,
  // который браузер потом отобьёт.
  it("ключ чужой директивы не выдаётся за свой", () => {
    expect(
      nonceFromPolicy("default-src 'self'; style-src 'nonce-чужой'"),
    ).toBeUndefined();
  });
});
