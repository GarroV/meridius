import { requireDemo } from "@/blocks/core/demo-gate";
import { DemoScreen } from "@/blocks/demo/ui/DemoScreen";

// Выбор роли открытого демо (D193). Без DEMO_MODE=1 адреса нет вовсе: прод ведёт себя как прежде.
export const dynamic = "force-dynamic";

export default function DemoPage() {
  requireDemo();
  return <DemoScreen />;
}
