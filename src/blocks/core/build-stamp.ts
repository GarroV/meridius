// Сторож T156: продукт называет сборку, которую отдаёт, — коммит и время запуска.
//
// Откуда задача. Локальный сервер живёт сутками и продолжает отдавать код той недели, когда
// его подняли: на порту 3100 висел `next-server` от 11.09 и ничего не знал ни о пакете,
// заведённом позже, ни о новых обходах. Дважды подряд человек искал причину в данных —
// в базе, в сиде, в самом коде, — а причина была в процессе, который никто не перезапускал.
// Отличить свежий сервер от вчерашнего было нечем: страница выглядит одинаково.
//
// Что именно называется. Два факта, каждый со своим смыслом:
//   * КОММИТ — из какого кода собран отдаваемый продукт. Запекается в сборку
//     (`next.config.ts` кладёт его в переменную `BUILD_COMMIT`, D033: значения переменных
//     запекаются), поэтому сборка не может передумать: она отвечает про свой код, а не про
//     состояние дерева в момент вопроса.
//   * ВРЕМЯ ЗАПУСКА — когда начался процесс, отдающий этот код. Считается от
//     `process.uptime()`, а не запоминается при загрузке модуля: горячая замена модулей
//     в разработке вычисляет модуль заново, и запомненное время начало бы обновляться,
//     показывая свежий сервер там, где он суточный.
//
// Чего сторож не обещает. Он отвечает за код, ИЗ КОТОРОГО СОБРАН, а не за то, что между
// сборкой и запуском дерево не двигали: если собрать, переключить ветку и только потом
// запустить, коммит назовёт сборку — и это правильный ответ, но не ответ на вопрос «что
// сейчас в дереве». Поэтому рядом живёт сравнение с текущей головой репозитория: оно и
// показывает расхождение словами, а не оставляет его на внимательность читателя.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import { repositoryRoot } from "./repo-copy";

/** Переменная, в которую сборка запекает коммит. Заполняет `next.config.ts`. */
export const BUILD_COMMIT_VAR = "BUILD_COMMIT";

/** Семь знаков — столько же показывает `git log --oneline`; глазами сверять удобно. */
const SHORT_LENGTH = 7;

/** Полный хэш коммита: `HEAD` в отсоединённом состоянии записан именно так. */
const FULL_SHA = /^[\da-f]{40}$/;

export interface BuildStamp {
  /** Коммит, из которого собран отдаваемый код. `undefined` — сборка не подписана. */
  readonly commit: string | undefined;
  /** Начало процесса, отдающего этот код (миллисекунды эпохи). */
  readonly startedAt: number;
}

/** Расхождение между отдаваемой сборкой и деревом репозитория рядом. */
export type BuildDrift =
  /** Отдаётся то же, что в дереве. */
  | { readonly kind: "same" }
  /** Репозиторий ушёл вперёд: сервер отдаёт код, которого в дереве уже нет. */
  | { readonly kind: "moved"; readonly head: string }
  /** Сравнивать не с чем: сборка не подписана или репозитория рядом нет (площадка). */
  | { readonly kind: "unknown" };

/** Коммит в том виде, в каком его показывают человеку. */
export function shortCommit(commit: string): string {
  return commit.slice(0, SHORT_LENGTH);
}

function readIfExists(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    // Файла нет — это не сбой: на площадке репозитория рядом не бывает вовсе.
    return undefined;
  }
}

/**
 * Каталог `.git` этой копии. У рабочего дерева (`git worktree`, а копии блоков стройки —
 * именно они) `.git` не каталог, а файл со строкой `gitdir:` — без этого разбора сторож
 * молчал бы ровно в тех копиях, где параллельных сборок больше всего.
 */
function gitDirectory(root: string): string | undefined {
  const dotGit = path.join(root, ".git");

  let entry;
  try {
    entry = statSync(dotGit);
  } catch {
    return undefined;
  }
  if (entry.isDirectory()) return dotGit;

  const pointer = /^gitdir:\s*(.+)$/m.exec(readIfExists(dotGit) ?? "")?.[1];
  if (pointer === undefined) return undefined;
  return path.resolve(root, pointer.trim());
}

/**
 * Голова репозитория рядом: тот коммит, на котором дерево стоит ПРЯМО СЕЙЧАС.
 * Читается файлами, а не запуском `git`: запуск процесса на каждую отрисовку страницы —
 * цена не за что, а ответ тот же.
 */
export function headCommit(
  root: string = repositoryRoot(),
): string | undefined {
  const gitDir = gitDirectory(root);
  if (gitDir === undefined) return undefined;

  const head = readIfExists(path.join(gitDir, "HEAD"))?.trim();
  if (head === undefined) return undefined;
  if (FULL_SHA.test(head)) return head;

  const ref = /^ref:\s*(.+)$/.exec(head)?.[1]?.trim();
  if (ref === undefined) return undefined;

  // Ветки рабочего дерева лежат в общем каталоге, а не в его собственном: `commondir`
  // говорит, где он. У обычной копии этого файла нет, и общий каталог — сам `.git`.
  const common = readIfExists(path.join(gitDir, "commondir"))?.trim();
  const commonDir =
    common === undefined ? gitDir : path.resolve(gitDir, common);

  for (const dir of new Set([gitDir, commonDir])) {
    const direct = readIfExists(path.join(dir, ref))?.trim();
    if (direct !== undefined && direct !== "") return direct;

    // `git gc` складывает ссылки в один файл, и отдельного файла ветки больше нет.
    const packed = readIfExists(path.join(dir, "packed-refs"));
    const line = packed
      ?.split("\n")
      .find((row) => row.endsWith(` ${ref}`))
      ?.split(" ")[0];
    if (line !== undefined && line !== "") return line;
  }

  return undefined;
}

/**
 * Начало процесса. Берётся от времени его работы, а не запоминается при первом обращении:
 * запомненное значение обновилось бы при горячей замене модулей — и суточный сервер
 * назвался бы только что запущенным, то есть сторож врал бы ровно в своём случае.
 */
export function processStartedAt(
  uptimeSeconds: number = process.uptime(),
  now: number = Date.now(),
): number {
  return Math.round(now - uptimeSeconds * 1000);
}

/** Подпись отдаваемой сборки: что запекла сборка и когда запущен процесс. */
export function buildStamp(
  env: Readonly<Record<string, string | undefined>>,
  startedAt: number = processStartedAt(),
): BuildStamp {
  const baked = env[BUILD_COMMIT_VAR]?.trim();
  return {
    commit: baked === undefined || baked === "" ? undefined : baked,
    startedAt,
  };
}

/** Разошлись ли отдаваемая сборка и дерево рядом. */
export function buildDrift(
  stamp: BuildStamp,
  head: string | undefined,
): BuildDrift {
  if (stamp.commit === undefined || head === undefined || head === "")
    return { kind: "unknown" };
  return stamp.commit === head ? { kind: "same" } : { kind: "moved", head };
}

/**
 * Время запуска словами: `16.09 09:40`. Собирается по частям, а не через `Intl`, —
 * подпись одинакова на обоих языках продукта и не зависит от того, какие данные о языках
 * собраны в этой сборке Node.
 */
function two(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatStartedAt(startedAt: number): string {
  const at = new Date(startedAt);
  return `${two(at.getDate())}.${two(at.getMonth() + 1)} ${two(at.getHours())}:${two(at.getMinutes())}`;
}
