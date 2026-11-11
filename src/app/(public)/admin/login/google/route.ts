import { demoLocked, demoLockedResponse } from "@/blocks/auth/demo-locks";
import { startGoogleSignIn } from "@/blocks/auth/google-flow";

// Кнопка «Войти через Google» ведёт сюда: метка в куку и переход к Google (D176).
// В открытом демо вход через Google закрыт (D194): отказ с текстом, а не уход к Google.
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  if (demoLocked()) return demoLockedResponse();
  return startGoogleSignIn();
}
