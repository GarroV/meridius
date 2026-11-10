import { startGoogleSignIn } from "@/blocks/auth/google-flow";
import { isDemoMode } from "@/blocks/core/demo-mode";

// Кнопка «Войти через Google» ведёт сюда: метка в куку и переход к Google (D176).
export const dynamic = "force-dynamic";

const FORBIDDEN = 403;

export function GET(): Promise<Response> {
  // Демо-режим (D193): Google закрыт, входят выбором роли на `/demo`.
  if (isDemoMode())
    return Promise.resolve(new Response(null, { status: FORBIDDEN }));
  return startGoogleSignIn();
}
