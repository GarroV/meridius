// Сторож вводных блоков (D152, T316): каждый раздел кабинета открывается блоком «зачем /
// что здесь делают / что дальше» — на обоих языках и на самом экране.
//
// Почему модульный, а не только сквозной. Сквозные гоняет CI, а быстрый набор — каждый
// пуш (D168): раздел, заведённый без вводного блока, должен краснеть на пуше, а не после
// слияния. Живой экран держит `e2e/section-intro.spec.ts`.
//
// Что проверяется по исходникам. Экран раздела вызывает `<SectionIntro section="…" />`;
// у раздела мастер-детали (есть разметка сегмента `src/app/admin/<раздел>/layout.tsx`)
// блок передаётся ещё и каркасу (`intro={<SectionIntro …`) — иначе на телефоне, где
// рабочей зоны без выбора не видно, раздел молчал бы.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ru from "@/messages/ru.json";

import { ADMIN_REDIRECTED_SECTIONS, ADMIN_SECTIONS } from "./admin-sections";
import { repositoryRoot } from "./repo-copy";
import { INTRO_PARTS, INTRO_SECTIONS } from "./section-intro";
import { withoutComments } from "./source-text";

const DICTIONARIES = { ru, en } as const;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (
      (path.endsWith(".tsx") || path.endsWith(".ts")) &&
      !path.includes(".test.")
    ) {
      found.push(path);
    }
  }
  return found;
}

const SOURCE = sourceFiles(join(repositoryRoot(), "src"))
  .map((path) => withoutComments(readFileSync(path, "utf8")))
  .join("\n");

function introOf(dictionary: unknown): Record<string, unknown> {
  const intro = (dictionary as Record<string, unknown>)["sectionIntro"];
  expect(intro, "в словаре нет пространства sectionIntro").toBeTypeOf("object");
  return intro as Record<string, unknown>;
}

describe("вводные блоки разделов кабинета", () => {
  it("обязаны все разделы меню, кроме уводящих в «Станции»", () => {
    const expected = Object.keys(ADMIN_SECTIONS).filter(
      (key) => !(ADMIN_REDIRECTED_SECTIONS as readonly string[]).includes(key),
    );
    expect([...INTRO_SECTIONS].sort()).toEqual(expected.sort());
    expect(INTRO_SECTIONS.length).toBeGreaterThan(0);
  });

  for (const [language, dictionary] of Object.entries(DICTIONARIES)) {
    it(`текст есть у каждого раздела, все три части (${language})`, () => {
      const intro = introOf(dictionary);
      expect(intro["label"], "подпись блока для чтеца").toBeTypeOf("string");
      for (const section of INTRO_SECTIONS) {
        const parts = intro[section] as Record<string, unknown> | undefined;
        expect(parts, `sectionIntro.${section} (${language})`).toBeTypeOf(
          "object",
        );
        for (const part of INTRO_PARTS) {
          const text = parts?.[part];
          expect(
            typeof text === "string" && text.trim().length > 0,
            `sectionIntro.${section}.${part} (${language}) пуст или отсутствует`,
          ).toBe(true);
        }
      }
      // Лишний раздел в словаре — след переименования, которое код уже не зовёт.
      const known = new Set<string>(["label", ...INTRO_SECTIONS]);
      expect(Object.keys(intro).filter((key) => !known.has(key))).toEqual([]);
    });
  }

  it("английский текст — перевод, а не копия русского", () => {
    const ruIntro = introOf(ru);
    const enIntro = introOf(en);
    for (const section of INTRO_SECTIONS) {
      for (const part of INTRO_PARTS) {
        const ruText = (ruIntro[section] as Record<string, string>)[part];
        const enText = (enIntro[section] as Record<string, string>)[part];
        expect(enText, `sectionIntro.${section}.${part}`).not.toBe(ruText);
        expect(enText, `sectionIntro.${section}.${part} (en)`).not.toMatch(
          /[А-Яа-яЁё]/,
        );
      }
    }
  });

  for (const section of INTRO_SECTIONS) {
    it(`раздел «${section}» ставит блок на экран`, () => {
      expect(
        SOURCE.includes(`<SectionIntro section="${section}"`),
        `ни один экран не вызывает <SectionIntro section="${section}" />`,
      ).toBe(true);

      const segmentLayout = join(
        repositoryRoot(),
        "src/app/admin",
        section,
        "layout.tsx",
      );
      if (!existsSync(segmentLayout)) return;
      expect(
        SOURCE.includes(`intro={<SectionIntro section="${section}"`),
        `раздел мастер-детали «${section}» не отдаёт блок каркасу — на телефоне его не видно`,
      ).toBe(true);
    });
  }
});
