// Блокировка входа обязана пережить перезапуск процесса (T212).
//
// Разбор находки: после шести неверных попыток вход отвечает «Повторите через 15 минут»,
// но перезапуск процесса снимал отказ мгновенно — счёт жил в памяти процесса. То есть
// защита от подбора пароля держалась на непрерывности процесса, а не на состоянии:
// перебирающему довольно было дождаться выкладки или падения, а продукт перезапускается
// сам (`restart: unless-stopped` у стенда, выкладка новой версии).
//
// Перезапуск здесь — повторная загрузка модуля: `vi.resetModules()` выбрасывает уже
// разобранные модули, и следующий `import` отдаёт модуль с чистой памятью. Это ровно
// то, что видит поднявшийся заново процесс, и ровно то, чего не видит обычный тест,
// живущий в одном экземпляре модуля.
//
// Ключ клиента у каждой проверки свой: счёт живёт в общей базе прогона, и соседний
// файл не должен видеть чужие попытки (и наоборот).
import { randomUUID } from "node:crypto";

import { expect, test, vi } from "vitest";

import { forgetLoginAttempts } from "./rate-limit";

// «Сейчас» — настоящее: уборка кончившихся окон ходит по времени, и строка с датой
// из прошлого была бы сметена соседним файлом прогона на его же первой попытке.
const NOW = new Date();
const SECOND = 1000;

function later(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * SECOND);
}

/**
 * Свежий клиент с пустым счётом.
 *
 * Счёт снимается, а не только придумывается новый адрес: клиент опознаётся корзиной от
 * хэша, корзин конечное число, и адрес прошлой проверки прогона может лечь в ту же.
 * Заодно снимается общий счёт — он один на всех, и чужие попытки запирали бы эту
 * проверку по причине, к ней не относящейся.
 */
async function freshClient(): Promise<string> {
  const client = `203.0.113.11-${randomUUID()}`;
  await forgetLoginAttempts(client);
  return client;
}

/** Поднять модуль заново — как поднялся бы заново процесс. */
async function restartedProcess(): Promise<typeof import("./rate-limit")> {
  vi.resetModules();
  return import("./rate-limit");
}

/** Занять `times` мест в счёте — столько же попыток входа. */
async function spend(
  auth: typeof import("./rate-limit"),
  client: string,
  times: number,
): Promise<void> {
  for (let attempt = 0; attempt < times; attempt++) {
    await auth.reserveLoginAttempt(client, NOW);
  }
}

test("отказ по числу попыток переживает перезапуск процесса", async () => {
  const client = await freshClient();
  const before = await restartedProcess();
  await spend(before, client, before.LOGIN_LIMITS.perClient.maxAttempts);
  expect((await before.reserveLoginAttempt(client, NOW)).allowed).toBe(false);

  const after = await restartedProcess();

  const verdict = await after.reserveLoginAttempt(client, NOW);
  expect(verdict.allowed).toBe(false);
  // Срок ожидания считается от первой попытки, а не от перезапуска: иначе перезапуск
  // продлевал бы отказ честному администратору.
  expect(verdict.retryAfterSeconds).toBe(
    before.LOGIN_LIMITS.perClient.windowSeconds,
  );
});

test("после перезапуска счёт продолжается, а не начинается заново", async () => {
  const client = await freshClient();
  const before = await restartedProcess();
  await spend(before, client, before.LOGIN_LIMITS.perClient.maxAttempts);

  const after = await restartedProcess();

  // Одной попытки после перезапуска хватило, чтобы упереться в предел: значит
  // поднявшийся заново процесс увидел прежние попытки, а не чистый лист.
  expect((await after.reserveLoginAttempt(client, NOW)).allowed).toBe(false);
});

test("после перезапуска кончившееся окно снова пускает", async () => {
  const client = await freshClient();
  const before = await restartedProcess();
  await spend(before, client, before.LOGIN_LIMITS.perClient.maxAttempts + 1);

  const after = await restartedProcess();

  // Состояние, которое переживает перезапуск, обязано и стареть: иначе один перебор
  // запирал бы вход навсегда.
  expect(
    (
      await after.reserveLoginAttempt(
        client,
        later(before.LOGIN_LIMITS.perClient.windowSeconds),
      )
    ).allowed,
  ).toBe(true);
});

test("снятый удачным входом счёт не возвращается после перезапуска", async () => {
  const client = await freshClient();
  const before = await restartedProcess();
  await spend(before, client, before.LOGIN_LIMITS.perClient.maxAttempts + 1);
  await before.forgetLoginAttempts(client);

  const after = await restartedProcess();

  expect((await after.reserveLoginAttempt(client, NOW)).allowed).toBe(true);
});
