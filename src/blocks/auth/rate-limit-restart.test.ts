// Блокировка входа обязана пережить перезапуск процесса (T212).
//
// Разбор находки: после шести неверных попыток вход отвечает «Повторите через 15 минут»,
// но перезапуск процесса снимал отказ мгновенно — счёт неудач жил в памяти процесса.
// То есть защита от подбора пароля держалась на непрерывности процесса, а не на
// состоянии: перебирающему довольно было дождаться выкладки или падения, а продукт
// перезапускается сам (`restart: unless-stopped` у стенда, выкладка новой версии).
//
// Перезапуск здесь — повторная загрузка модуля: `vi.resetModules()` выбрасывает уже
// разобранные модули, и следующий `import` отдаёт модуль с чистой памятью. Это ровно
// то, что видит поднявшийся заново процесс, и ровно то, чего не видит обычный тест,
// живущий в одном экземпляре модуля.
//
// Ключ клиента у каждой проверки свой: счёт живёт в общей базе прогона, и соседний
// файл не должен видеть чужие неудачи (и наоборот).
import { randomUUID } from "node:crypto";

import { expect, test, vi } from "vitest";

// «Сейчас» — настоящее: уборка кончившихся окон ходит по времени, и строка с датой
// из прошлого была бы сметена соседним файлом прогона на его же первой неудаче.
const NOW = new Date();
const SECOND = 1000;

function later(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * SECOND);
}

function client(): string {
  return `203.0.113.11-${randomUUID()}`;
}

/** Поднять модуль заново — как поднялся бы заново процесс. */
async function restartedProcess(): Promise<typeof import("./rate-limit")> {
  vi.resetModules();
  return import("./rate-limit");
}

async function exhaust(
  auth: typeof import("./rate-limit"),
  key: string,
  times: number,
): Promise<void> {
  for (let attempt = 0; attempt < times; attempt++) {
    await auth.registerLoginFailure(key, NOW);
  }
}

test("отказ по числу попыток переживает перезапуск процесса", async () => {
  const key = client();
  const before = await restartedProcess();
  await exhaust(before, key, before.LOGIN_LIMITS.perClient.maxFailures);
  expect((await before.checkLoginAllowed(key, NOW)).allowed).toBe(false);

  const after = await restartedProcess();

  const verdict = await after.checkLoginAllowed(key, NOW);
  expect(verdict.allowed).toBe(false);
  // Срок ожидания считается от первой неудачи, а не от перезапуска: иначе перезапуск
  // продлевал бы отказ честному администратору.
  expect(verdict.retryAfterSeconds).toBe(
    before.LOGIN_LIMITS.perClient.windowSeconds,
  );
});

test("после перезапуска счёт продолжается, а не начинается заново", async () => {
  const key = client();
  const before = await restartedProcess();
  const limit = before.LOGIN_LIMITS.perClient.maxFailures;
  await exhaust(before, key, limit - 1);
  expect((await before.checkLoginAllowed(key, NOW)).allowed).toBe(true);

  const after = await restartedProcess();
  await exhaust(after, key, 1);

  // Одной неудачи после перезапуска хватило, чтобы упереться в предел: значит
  // поднявшийся заново процесс увидел прежние промахи, а не чистый лист.
  expect((await after.checkLoginAllowed(key, NOW)).allowed).toBe(false);
});

test("после перезапуска кончившееся окно снова пускает", async () => {
  const key = client();
  const before = await restartedProcess();
  await exhaust(before, key, before.LOGIN_LIMITS.perClient.maxFailures);

  const after = await restartedProcess();

  // Состояние, которое переживает перезапуск, обязано и стареть: иначе один перебор
  // запирал бы вход навсегда.
  expect(
    (
      await after.checkLoginAllowed(
        key,
        later(before.LOGIN_LIMITS.perClient.windowSeconds),
      )
    ).allowed,
  ).toBe(true);
});

test("снятый удачным входом счёт не возвращается после перезапуска", async () => {
  const key = client();
  const before = await restartedProcess();
  await exhaust(before, key, before.LOGIN_LIMITS.perClient.maxFailures);
  await before.forgetLoginFailures(key);

  const after = await restartedProcess();

  expect((await after.checkLoginAllowed(key, NOW)).allowed).toBe(true);
});
