import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { demoHref } from "./demo-link";

const KEYS = ["DEMO_MODE", "DEMO_URL"] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of KEYS) {
    saved.set(key, process.env[key]);
    Reflect.deleteProperty(process.env, key);
  }
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved.get(key);
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
});

describe("куда ведёт «Открыть демо»", () => {
  it("ни режима демо, ни адреса — кнопки нет", () => {
    expect(demoHref("en")).toBeNull();
  });

  it("в режиме демо — свой /demo с языком", () => {
    process.env["DEMO_MODE"] = "1";
    expect(demoHref("ru")).toBe("/demo?lang=ru");
  });

  it("режим демо сильнее DEMO_URL", () => {
    process.env["DEMO_MODE"] = "1";
    process.env["DEMO_URL"] = "https://demo.example/demo";
    expect(demoHref("en")).toBe("/demo?lang=en");
  });

  it("DEMO_URL — абсолютный адрес стенда, язык дописан", () => {
    process.env["DEMO_URL"] = "https://meridius-demo.example.dev/demo";
    expect(demoHref("ru")).toBe(
      "https://meridius-demo.example.dev/demo?lang=ru",
    );
  });

  it("DEMO_URL читается при каждом вызове, а не запоминается", () => {
    process.env["DEMO_URL"] = "https://a.example/demo";
    expect(demoHref("en")).toBe("https://a.example/demo?lang=en");
    process.env["DEMO_URL"] = "https://b.example/demo";
    expect(demoHref("en")).toBe("https://b.example/demo?lang=en");
  });

  it.each(["", "   ", "demo", "/demo", "javascript:alert(1)", "ftp://x/y"])(
    "DEMO_URL=%j не адрес http(s) — кнопки нет",
    (value) => {
      process.env["DEMO_URL"] = value;
      expect(demoHref("en")).toBeNull();
    },
  );
});
