import { startGoogleSignIn } from "@/blocks/auth/google-flow";

// Кнопка «Войти через Google» ведёт сюда: метка в куку и переход к Google (D176).
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return startGoogleSignIn();
}
