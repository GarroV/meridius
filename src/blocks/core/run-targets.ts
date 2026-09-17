/**
 * Цели прогона проекта — один список и один набор переменных (T226, решение D101).
 *
 * У проекта несколько точек входа в прогон: `scripts/check` (её зовут приёмка блока и
 * CI), хук `pre-push`, `npm test` и `npm run e2e` у человека за клавиатурой. Цель,
 * отличающаяся набором переменных или списком флагов, — это вторая правда о состоянии
 * проекта, и зелёной она будет ровно тогда, когда проверяет меньше.
 *
 * Так и было до этой задачи: `scripts/check` звал `vitest run --coverage --reporter=junit`,
 * а `npm test` — голый `vitest run`. Прогон «у себя» не писал ни покрытия, ни машинного
 * отчёта, то есть не проходил ни порога покрытия, ни планки числа проверок, и при этом
 * выглядел как тот же самый прогон.
 *
 * Здесь разбор точек входа, которым это стережётся машинно. Разбор грубый и намеренно
 * такой: он ищет прямые вызовы раннеров и переменные, приписанные перед командой, —
 * то, чем набор расходится на практике.
 */

/** Раннеры проекта. Прямой вызов любого из них мимо npm-скрипта заводит второй список. */
export const RUNNERS = ["vitest", "playwright"] as const;

/** Строки кода без комментариев: пояснения в скриптах упоминают и раннеры, и флаги. */
export function codeLines(text: string): readonly string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line !== "" && !/^\s*#/.test(line));
}

/**
 * Прямые вызовы раннеров — то есть мимо `npm run`.
 *
 * `playwright install` не в счёт: это установка браузера, а не прогон. Разница важна —
 * CI обязан ставить браузер сам, и запрет на это сделал бы правило неисполнимым.
 */
export function directRunnerCalls(text: string): readonly string[] {
  return codeLines(text).filter((line) => {
    if (/\bplaywright\s+install\b/.test(line)) return false;
    return RUNNERS.some((runner) =>
      new RegExp(`(^|[\\s"'\`/])${runner}(\\s|$)`).test(line),
    );
  });
}

/**
 * Переменные, приписанные перед командой прогона: `ИМЯ=значение npm run test`.
 *
 * Такая приписка и есть расхождение наборов в чистом виде: цель получает переменную,
 * которой нет у соседней, и проверяет что-то своё.
 */
export function inlineEnvNames(text: string): readonly string[] {
  const names = new Set<string>();
  for (const line of codeLines(text)) {
    const found =
      /^\s*(?:run\s+"[^"]*"\s+)?((?:[A-Z_][A-Z0-9_]*=\S*\s+)+)(\S+)/.exec(line);
    if (found?.[1] === undefined || found[2] === undefined) continue;
    if (!/npm|node|npx|check/.test(found[2])) continue;
    for (const pair of found[1].trim().split(/\s+/)) {
      const name = pair.split("=")[0];
      if (name !== undefined) names.add(name);
    }
  }
  return [...names].sort();
}

/**
 * Текст одной работы из файла прогона CI.
 *
 * Разбор по отступам, а не библиотекой YAML: в зависимостях её нет, а заводить
 * зависимость ради чтения двух работ дороже, чем разобрать их отступом.
 */
export function ciJob(workflow: string, name: string): string {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}
