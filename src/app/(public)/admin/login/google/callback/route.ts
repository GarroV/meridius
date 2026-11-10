import type { NextRequest } from "next/server";

import { finishGoogleSignIn } from "@/blocks/auth/google-flow";
import { isDemoMode } from "@/blocks/core/demo-mode";

// Адрес возврата от Google — его и записывают в консоли как redirect URI (D176).
export const dynamic = "force-dynamic";

const FORBIDDEN = 403;

export function GET(request: NextRequest): Promise<Response> {
  // Демо-режим (D193): Google закрыт, входят выбором роли на `/demo`.
  if (isDemoMode())
    return Promise.resolve(new Response(null, { status: FORBIDDEN }));
  return finishGoogleSignIn(request.nextUrl);
}
