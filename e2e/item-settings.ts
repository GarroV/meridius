import type { Locator } from "@playwright/test";

/** Раскрывает настройки пункта тем же нажатием, которым пользуется методист. */
export async function revealItemSettings(control: Locator): Promise<void> {
  const details = control.locator("xpath=ancestor::details[1]");
  if (
    (await details.count()) &&
    (await details.getAttribute("open")) === null
  ) {
    await details.locator(":scope > summary").click();
  }
}
