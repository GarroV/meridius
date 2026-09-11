import { Buffer } from "node:buffer";

import { describe, expect, test, vi } from "vitest";

import { hashPassword, verifyPassword } from "./password";

/**
 * Журнал криптографических операций одной проверки пароля.
 *
 * Заведён через `vi.hoisted`, потому что фабрика `vi.mock` поднимается выше объявлений
 * файла и обычную переменную из неё не видно.
 */
const { operations } = vi.hoisted(() => ({ operations: [] as string[] }));

interface ScryptOptions {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly maxmem: number;
}

/**
 * Настоящий `node:crypto`, но каждый вызов `scrypt` и `timingSafeEqual` попадает в журнал.
 * Подменено только наблюдение: работу выполняет та же самая реализация, поэтому остальные
 * проверки файла видят обычное поведение.
 *
 * Сам пароль в журнал НЕ пишется — он единственное, чему позволено различаться между
 * ветками. Записывается только работа: соль, длина ключа, параметры scrypt, длины
 * сравниваемых буферов и порядок вызовов.
 */
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();

  return {
    ...actual,
    scrypt(
      password: string,
      salt: Buffer,
      keyLength: number,
      options: ScryptOptions,
      callback: (error: Error | null, key: Buffer) => void,
    ): void {
      operations.push(
        `scrypt соль=${salt.toString("base64url")} ключ=${String(keyLength)} N=${String(options.N)} r=${String(options.r)} p=${String(options.p)}`,
      );
      actual.scrypt(password, salt, keyLength, options, callback);
    },
    timingSafeEqual(left: Buffer, right: Buffer): boolean {
      operations.push(
        `timingSafeEqual ${String(left.length)}=${String(right.length)}`,
      );
      return actual.timingSafeEqual(left, right);
    },
  };
});

// Параметры слабее рабочих: тесту нужна проверяемая логика, а не стойкость к перебору.
// Формат хранит параметры внутри строки, поэтому рабочий хэш проверяется тем же кодом.
const TEST_PARAMS = { cost: 1024, blockSize: 8, parallelization: 1 } as const;
const PASSWORD = "правильный-пароль-методиста";

async function testHash(password = PASSWORD): Promise<string> {
  return hashPassword(password, TEST_PARAMS);
}

describe("hashPassword", () => {
  test("выдаёт строку с именем алгоритма и параметрами, но без самого пароля", async () => {
    const stored = await testHash();

    expect(stored.startsWith("scrypt.")).toBe(true);
    expect(stored).toContain("1024");
    expect(stored).not.toContain(PASSWORD);
  });

  test("в хэше нет знака $: иначе его съедает подстановка загрузчика .env", async () => {
    // Разделитель PHC `$` превращает `scrypt$32768$8$3$соль$ключ` в `scrypt-ключ` при
    // первой же загрузке `.env` (см. env-file.test.ts). Формат обязан обходиться без него.
    expect(await testHash()).not.toContain("$");
  });

  test("на один и тот же пароль даёт разные хэши — соль случайная", async () => {
    expect(await testHash()).not.toBe(await testHash());
  });
});

describe("verifyPassword", () => {
  test("принимает верный пароль", async () => {
    await expect(verifyPassword(PASSWORD, await testHash())).resolves.toBe(
      true,
    );
  });

  test("отвергает неверный пароль", async () => {
    await expect(
      verifyPassword("другой-пароль", await testHash()),
    ).resolves.toBe(false);
  });

  test("отвергает пароль, отличающийся одним знаком", async () => {
    await expect(
      verifyPassword(`${PASSWORD}!`, await testHash()),
    ).resolves.toBe(false);
  });

  test("отвергает пустой пароль", async () => {
    await expect(verifyPassword("", await testHash())).resolves.toBe(false);
  });

  test("проверяет хэш, посчитанный с рабочими параметрами, теми же параметрами", async () => {
    const stored = await hashPassword(PASSWORD, {
      cost: 2048,
      blockSize: 8,
      parallelization: 2,
    });

    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true);
    await expect(verifyPassword("другой-пароль", stored)).resolves.toBe(false);
  });

  test("на испорченном хэше падает с внятной ошибкой, а не молча пускает", async () => {
    for (const broken of [
      "",
      "не-хэш",
      "scrypt.1024.8",
      "bcrypt.1024.8.1.c29sdA.aGFzaA",
    ]) {
      await expect(verifyPassword(PASSWORD, broken)).rejects.toThrow(
        /ADMIN_PASSWORD_HASH/,
      );
    }
  });

  test("отвергает хэш с нечисловыми параметрами scrypt", async () => {
    const [, , blockSize, parallelization, salt, key] = (
      await testHash()
    ).split(".");
    const broken = [
      "scrypt",
      "не-число",
      blockSize,
      parallelization,
      salt,
      key,
    ].join(".");

    await expect(verifyPassword(PASSWORD, broken)).rejects.toThrow(
      /ADMIN_PASSWORD_HASH/,
    );
  });

  test("отвергает хэш с солью или ключом не той длины", async () => {
    await expect(
      verifyPassword(PASSWORD, "scrypt.1024.8.1.c29sdA.aGFzaA"),
    ).rejects.toThrow(/ADMIN_PASSWORD_HASH/);
  });

  test("ошибка про испорченный хэш не выносит наружу ни пароль, ни сам хэш", async () => {
    const stored = await testHash();
    const broken = `bcrypt.${stored.split(".").slice(1).join(".")}`;

    const error = await verifyPassword(PASSWORD, broken).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(Error);
    const text = `${String(error)} ${JSON.stringify((error as Error).message)}`;
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(broken.split(".").at(-1));
  });
});

/**
 * Записывает работу, которую проверка пароля выполнила на самом деле.
 *
 * Журнал общий на файл, поэтому чистится дважды: перед замером — чтобы в него не попала
 * подготовка хэша, и на выдаче — чтобы следующий замер начинался с пустого.
 */
async function operationsOf(
  password: string,
  stored: string,
): Promise<readonly string[]> {
  operations.splice(0);
  await verifyPassword(password, stored);
  return operations.splice(0);
}

/**
 * Проверка не настенных часов, а самой работы.
 *
 * Замер времени вокруг `scrypt` это свойство доказать не может: ветки «верный» и
 * «неверный» выполняют одно и то же, поэтому измеряется чистый шум планировщика, а
 * на общей машине он же и роняет прогон. Вместо него сверяется, что путь неверного
 * пароля состоит из тех же операций, что путь верного: полный `scrypt` с теми же
 * параметрами и сравнение целиком через `timingSafeEqual`.
 */
describe("сравнение постоянного времени", () => {
  test("неверный пароль проходит ровно ту же работу, что и верный", async () => {
    const stored = await testHash();
    const right = await operationsOf(PASSWORD, stored);

    // Четыре вида неверного: короче, той же длины, отличается одним знаком, пустой.
    for (const wrong of [
      "x",
      "п".repeat(PASSWORD.length),
      `${PASSWORD.slice(0, -1)}!`,
      "",
    ]) {
      expect(await operationsOf(wrong, stored)).toStrictEqual(right);
    }
  });

  test("путь неверного пароля доходит до scrypt и до timingSafeEqual, а не отваливается раньше", async () => {
    const stored = await testHash();
    const salt = stored.split(".")[4] ?? "";

    // Раннего возврата нет: ровно один полный scrypt с параметрами из хэша, затем
    // сравнение обоих ключей целиком. Сравнение через `Buffer.equals` или `===`
    // оставило бы журнал без второй строки.
    await expect(operationsOf("другой-пароль", stored)).resolves.toStrictEqual([
      `scrypt соль=${salt} ключ=32 N=1024 r=8 p=1`,
      "timingSafeEqual 32=32",
    ]);
  });
});
