// Сторож различимости: три вида тревоги обязаны читаться как три РАЗНЫХ события —
// и по-русски, и по-английски.
//
// Зачем он нужен именно здесь. По D063 виды тревоги визуально НЕ различаются: ни цвета,
// ни значка, ни третьего стиля тега в дизайн-системе («хватит текста»). Значит весь груз
// различения лёг на формулировку, и она осталась единственной опорой: спутанные слова —
// это спутанные события, а не мелкая неточность перевода.
//
// Чего НЕ ловит общий сторож словаря (`core/messages-keys.test.ts`). Он разбирает только
// статические ключи, а полоса зовёт словарь собранным: `t(row.kind, …)`. Оба ключа
// провалов — `criticalFailed` и `criticalUnanswered` — статическому разбору не видны
// вовсе, и их пропажа из словаря прошла бы мимо гейта: next-intl нарисовал бы сам ключ
// и не упал (T123).
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

import type { AlarmKind } from "./alarms";
import { alarmText } from "./alarm-text";

const KINDS = [
  "criticalFailed",
  "criticalUnanswered",
  "missed",
] as const satisfies readonly AlarmKind[];

const CATALOGUES = [
  { locale: "ru", messages: ru },
  { locale: "en", messages: en },
] as const;

/** Русские множественные формы расходятся на 1, 2 и 5 — проверяются все три. */
const COUNTS = [1, 2, 5] as const;

const TIME = "12:00";

function render(
  locale: string,
  messages: typeof ru | typeof en,
  kind: AlarmKind,
  itemCount: number,
): string {
  const t = createTranslator({ locale, messages, namespace: "feed.alarms" });
  const { key, values } = alarmText({ kind, itemCount }, TIME);
  return t(key, values);
}

describe("формулировки тревог", () => {
  for (const { locale, messages } of CATALOGUES) {
    describe(locale, () => {
      it.each(KINDS)("%s назван словами, а не ключом", (kind) => {
        const text = render(locale, messages, kind, 1);

        expect(text).not.toBe("");
        // next-intl на пропавший ключ не падает, а рисует сам ключ: без этой проверки
        // «feed.alarms.criticalUnanswered» уехало бы на экран управляющего молча.
        expect(text).not.toContain(kind);
      });

      it.each(COUNTS)("три вида различимы при count=%i", (count) => {
        const texts = KINDS.map((kind) =>
          render(locale, messages, kind, count),
        );

        expect(new Set(texts).size).toBe(KINDS.length);
      });

      it("ни одна формулировка не начало другой", () => {
        const texts = KINDS.map((kind) =>
          render(locale, messages, kind, 1).toLocaleLowerCase(locale),
        );

        // Совпадения строк мало: «критичный пункт» внутри «критичный пункт остался без
        // ответа» читается с первого взгляда как провал, и разница договаривается только
        // хвостом, которого глаз в полосе из шести строк уже не ищет.
        for (const text of texts) {
          const prefixOf = texts.filter(
            (other) => other !== text && other.startsWith(text),
          );
          expect(prefixOf).toEqual([]);
        }
      });

      it("незаполненный чек-лист называет время закрытия окна", () => {
        expect(render(locale, messages, "missed", 0)).toContain(TIME);
      });

      it.each(["criticalFailed", "criticalUnanswered"] as const)(
        "%s называет число пунктов, когда их больше одного",
        (kind) => {
          expect(render(locale, messages, kind, 3)).toContain("3");
        },
      );
    });
  }
});
