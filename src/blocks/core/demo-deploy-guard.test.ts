// Сторож скриптов демо-стенда (D194): reset.sh сносит том базы, поэтому из чужого дерева
// и с чужим окружением он обязан отказывать, а не работать. Проверяется настоящим bash на
// временном дереве. Docker не нужен: гоняется только guard.sh.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { repositoryRoot } from "./repo-copy";

const GUARD = join(repositoryRoot(), "deploy", "demo", "guard.sh");

function tree(envLines: string | null): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "meridius-demo-")));
  mkdirSync(join(root, "deploy", "demo"), { recursive: true });
  if (envLines !== null) {
    writeFileSync(join(root, "deploy", "demo", ".env"), envLines);
  }
  return root;
}

function run(cwd: string, demoTree: string) {
  return spawnSync(
    "bash",
    ["-c", `source "${GUARD}"; require_demo_tree; echo PASSED`],
    {
      cwd,
      env: { ...process.env, MERIDIUS_DEMO_TREE: demoTree },
      encoding: "utf8",
    },
  );
}

describe("guard.sh демо-стенда", () => {
  test("пускает только дерево демо с DEMO_MODE=1 в deploy/demo/.env", () => {
    const root = tree("DEMO_MODE=1\n");
    const result = run(root, root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASSED");
  });

  test("чужое дерево — отказ с названием причины", () => {
    const root = tree("DEMO_MODE=1\n");
    const result = run(root, "/srv/meridius-demo");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/не дерево демо/);
    expect(result.stdout).not.toContain("PASSED");
  });

  test("нет файла окружения или в нём нет DEMO_MODE=1 — отказ", () => {
    for (const env of [null, "POSTGRES_DB=meridius\n", "DEMO_MODE=0\n"]) {
      const root = tree(env);
      const result = run(root, root);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/нет DEMO_MODE=1/);
    }
  });
});
