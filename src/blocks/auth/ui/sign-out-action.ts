"use server";

import { redirect } from "next/navigation";

import { DEMO_PATH, isDemoMode } from "@/blocks/core/demo-mode";

import { signOut } from "../actions";
import { LOGIN_PATH } from "../routes";

/** Действие кнопки «Выйти»: убирает куку и возвращает на форму входа. */
export async function submitSignOut(): Promise<void> {
  await signOut();
  // В демо входа паролем нет: «выйти» — сменить роль на `/demo`.
  redirect(isDemoMode() ? DEMO_PATH : LOGIN_PATH);
}
