// Какие разделы кабинета обязаны открываться вводным блоком (D152, T316).
//
// Список не пишется руками: это разделы меню (`ADMIN_SECTIONS`) без тех, чей адрес только
// уводит в «Станции» (`ADMIN_REDIRECTED_SECTIONS`) — своего экрана у них нет, объяснять
// нечего. Новый раздел меню попадает сюда сам, и сторож (`section-intro.test.ts`) сразу
// требует от него текста на обоих языках и вставки на экран.
import {
  ADMIN_REDIRECTED_SECTIONS,
  ADMIN_SECTIONS,
  type AdminSectionKey,
} from "./admin-sections";

/** Раздел, у которого есть свой экран, а значит и вводный блок. */
export type IntroSectionKey = Exclude<AdminSectionKey, "qr" | "devices">;

export const INTRO_SECTIONS: readonly IntroSectionKey[] = (
  Object.keys(ADMIN_SECTIONS) as AdminSectionKey[]
).filter(
  (key): key is IntroSectionKey => !ADMIN_REDIRECTED_SECTIONS.includes(key),
);

/** Три части блока — ровно то, что попросил владелец: зачем, что здесь, что дальше. */
export const INTRO_PARTS = ["why", "what", "next"] as const;
