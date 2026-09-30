import type { NextRequest } from "next/server";

import { finishGoogleSignIn } from "@/blocks/auth/google-flow";

// Адрес возврата от Google — его и записывают в консоли как redirect URI (D176).
export const dynamic = "force-dynamic";

export function GET(request: NextRequest): Promise<Response> {
  return finishGoogleSignIn(request.nextUrl);
}
