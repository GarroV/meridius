// Проверки сторожа сборки (T156).
//
// Главное, что здесь проверяется, — не формат подписи, а её честность: подпись обязана
// краснеть на устаревшей сборке. Сторож, который на вопрос «из какого ты кода» отвечает
// сегодняшней головой репозитория, выглядит работающим и не ловит ровно тот случай, ради
// которого заведён, — суточный сервер с кодом прошлой недели.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  BUILD_COMMIT_VAR,
  buildDrift,
  buildStamp,
  formatStartedAt,
  headCommit,
  processStartedAt,
  shortCommit,
} from "./build-stamp";
import { repositoryRoot } from "./repo-copy";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "89abcdef0123456789abcdef0123456789abcdef";

/** Каталог с рукотворным `.git`: так проверяются раскладки, которых нет у этой копии. */
function gitFixture(layout: (gitDir: string) => void): string {
  const root = mkdtempSync(path.join(tmpdir(), "meridius-build-stamp-"));
  const gitDir = path.join(root, ".git");
  mkdirSync(gitDir, { recursive: true });
  layout(gitDir);
  return root;
}

describe("подпись сборки (T156)", () => {
  test("коммит показывается семью знаками — как в git log", () => {
    expect(shortCommit(COMMIT)).toBe("0123456");
  });

  test("подпись берёт коммит из того, что запекла сборка", () => {
    const stamp = buildStamp({ [BUILD_COMMIT_VAR]: COMMIT }, 1_700_000_000_000);

    expect(stamp.commit).toBe(COMMIT);
    expect(stamp.startedAt).toBe(1_700_000_000_000);
  });

  test("сборка без подписи так и говорит, а не выдумывает коммит", () => {
    // Подделка, ради которой проверка и написана: подпись, которая при пустой переменной
    // сходит к текущей голове репозитория, на устаревшей сборке покажет сегодняшний
    // коммит — и расхождение исчезнет ровно там, где оно важно. Рядом с этим прогоном
    // настоящий репозиторий есть (прогон идёт в копии), так что подмена была бы «успешной».
    expect(buildStamp({}).commit).toBeUndefined();
    expect(buildStamp({ [BUILD_COMMIT_VAR]: "" }).commit).toBeUndefined();
    expect(buildStamp({ [BUILD_COMMIT_VAR]: "   " }).commit).toBeUndefined();
    expect(headCommit()).toBeDefined();
  });

  test("время запуска — начало процесса, а не момент вопроса", () => {
    // Тот же процесс, спрошенный дважды с разницей в десять секунд, обязан назвать одно
    // и то же начало. Иначе горячая замена модулей в разработке обновляла бы подпись,
    // и суточный сервер выглядел бы только что запущенным.
    const first = processStartedAt(10, 1_700_000_010_000);
    const later = processStartedAt(20, 1_700_000_020_000);

    expect(first).toBe(1_700_000_000_000);
    expect(later).toBe(first);
  });

  test("расхождение названо словами: дерево ушло вперёд", () => {
    const stamp = buildStamp({ [BUILD_COMMIT_VAR]: COMMIT }, 0);

    expect(buildDrift(stamp, COMMIT)).toEqual({ kind: "same" });
    expect(buildDrift(stamp, OTHER)).toEqual({ kind: "moved", head: OTHER });
  });

  test("сравнивать не с чем — так и сказано, а не «всё совпало»", () => {
    // Молчание здесь опаснее отказа: «unknown», выданное за «same», означает зелёный
    // ответ на площадке, где репозитория рядом нет вовсе.
    expect(buildDrift(buildStamp({}, 0), COMMIT)).toEqual({ kind: "unknown" });
    expect(
      buildDrift(buildStamp({ [BUILD_COMMIT_VAR]: COMMIT }, 0), undefined),
    ).toEqual({ kind: "unknown" });
    expect(
      buildDrift(buildStamp({ [BUILD_COMMIT_VAR]: COMMIT }, 0), ""),
    ).toEqual({ kind: "unknown" });
  });

  test("голова этой копии читается — и совпадает с тем, что скажет git", () => {
    // Копия блока стройки — рабочее дерево (`git worktree`): `.git` у неё файл со строкой
    // `gitdir:`, а ветки лежат в общем каталоге. Прочитать это иначе, чем разобрав
    // `commondir`, нельзя — а молчащий сторож не отличим от сторожа, которому нечего сказать.
    const fromGit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot(),
      encoding: "utf8",
    }).trim();

    expect(headCommit()).toBe(fromGit);
  });

  test("ветка в отдельном файле ссылки", () => {
    const root = gitFixture((gitDir) => {
      writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/feat/core\n");
      mkdirSync(path.join(gitDir, "refs/heads/feat"), { recursive: true });
      writeFileSync(path.join(gitDir, "refs/heads/feat/core"), `${COMMIT}\n`);
    });

    expect(headCommit(root)).toBe(COMMIT);
  });

  test("ветка упакована в packed-refs — отдельного файла нет", () => {
    // `git gc` убирает файлы ссылок в один список. Без этой ветки сторож замолчал бы
    // на любой копии, где сборщик мусора уже проходил.
    const root = gitFixture((gitDir) => {
      writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
      writeFileSync(
        path.join(gitDir, "packed-refs"),
        `# pack-refs with: peeled fully-peeled sorted \n${OTHER} refs/remotes/origin/main\n${COMMIT} refs/heads/main\n`,
      );
    });

    expect(headCommit(root)).toBe(COMMIT);
  });

  test("отсоединённая голова записана самим коммитом", () => {
    const root = gitFixture((gitDir) => {
      writeFileSync(path.join(gitDir, "HEAD"), `${COMMIT}\n`);
    });

    expect(headCommit(root)).toBe(COMMIT);
  });

  test("репозитория рядом нет — это не сбой, а «сравнивать не с чем»", () => {
    // На площадке продукт живёт без дерева. Исключение здесь остановило бы отрисовку
    // кабинета целиком — подпись сборки такой цены не стоит.
    const empty = mkdtempSync(path.join(tmpdir(), "meridius-no-git-"));

    expect(headCommit(empty)).toBeUndefined();
  });

  test("время запуска читается человеком: день, месяц, часы, минуты", () => {
    const at = new Date(2026, 8, 6, 9, 5).getTime();

    expect(formatStartedAt(at)).toBe("06.09 09:05");
  });
});
