"use server";

// Отвязка планшета из кабинета (T297).
//
// `requireAdmin()` стоит первой строкой: тело действия зовёт кто угодно, а не только
// кнопка экрана «Устройства» — охрана разметки (`src/app/admin/layout.tsx`) действия не
// закрывает, они выполняются мимо дерева разметки (тот же приём, что у
// `qr/ui/actions.ts` и `pair-action.ts` этого же блока).
//
// Действие ничего не решает само — вопрос «отвязать ли» уже задан и подтверждён на
// экране (`UnlinkButton.tsx`, окно `core/ui/ConfirmDialog`), поэтому здесь нет ветки
// «confirmed», как у перевыпуска кода в справочнике: отвязка выполняется сразу.
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/blocks/auth/guard";
import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";

import { unpairDevice } from "../devices";

/** Итог отвязки: `ok: false` — строки уже не было (отвязали дважды или станцию снесли). */
export interface UnlinkOutcome {
  readonly ok: boolean;
}

/**
 * Отвязывает планшет по опознавателю. Зовётся напрямую из клиентской кнопки
 * (`UnlinkButton.tsx`) — не как `<form action>`: результату есть куда деться только
 * через JavaScript, потому что решение «показать отказ» принимает кнопка, а не адрес.
 */
export async function unlinkDevice(id: string): Promise<UnlinkOutcome> {
  await requireAdmin();

  const ok = await unpairDevice(id);
  revalidatePath(ADMIN_SECTIONS.devices.path);

  return { ok };
}
