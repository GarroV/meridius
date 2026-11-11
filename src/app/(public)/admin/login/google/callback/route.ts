import type { NextRequest } from "next/server";

import { demoLocked, demoLockedResponse } from "@/blocks/auth/demo-locks";
import { finishGoogleSignIn } from "@/blocks/auth/google-flow";

// Адрес возврата от Google — его и записывают в консоли как redirect URI (D176).
// В открытом демо вход через Google закрыт (D194).
export const dynamic = "force-dynamic";

export function GET(request: NextRequest): Promise<Response> {
  if (demoLocked()) return demoLockedResponse();
  return finishGoogleSignIn(request.nextUrl);
}
