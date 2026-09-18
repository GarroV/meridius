import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import type { Section } from "@/blocks/data";
import {
  checklistVersions,
  getDb,
  getSubmission,
  listSubmissions,
  publishVersion,
  submissions,
} from "@/blocks/data";
import {
  createChecklist,
  createDraft,
  createStation,
} from "@/blocks/data/testing/fixtures";

import { FILL_LIMITS, forgetAllFillHits } from "./rate-limit";
import type { SubmitOutcome } from "./submit";
import { submitFilling } from "./submit";
import { issueFillTicket, readFillTicket } from "./ticket";

const NOW = new Date("2026-09-06T09:30:00Z");
const STARTED_AT = NOW.getTime() - 3 * 60 * 1000;

/**
 * Пропуск ровно на ту пару «код + версия», которая стоит в теле.
 *
 * Подписывается он сервером в момент выдачи экрана, поэтому в проверках его
 * выписывают тем же вызовом, что и продукт. Каждый вызов даёт свой пропуск:
 * время выдачи внутри процесса неповторимо, и две отправки с разными пропусками —
 * это две разные отправки, а не повтор.
 */
function ticketFor(code: string, versionId: string, at: Date = NOW): string {
  return issueFillTicket({ code, versionId }, at);
}

function sectionsWith(label: string): Section[] {
  return [
    {
      id: `s-${label}`,
      title: { ru: "Печь", en: "Oven" },
      source: "own",
      items: [
        {
          id: `bool-${label}`,
          title: { ru: "Включить печь", en: "Turn on the oven" },
          type: "bool",
          critical: true,
        },
        {
          id: `num-${label}`,
          title: { ru: "Температура", en: "Temperature" },
          type: "number",
          critical: false,
          min: 2,
          max: 4,
        },
      ],
    },
  ];
}

interface Stand {
  code: string;
  stationId: string;
  checklistId: string;
  versionId: string;
  sections: Section[];
}

async function stand(label: string): Promise<Stand> {
  const station = await createStation();
  const checklistId = await createChecklist({
    stationId: station.stationId,
    windowStart: "06:00:00",
    windowEnd: "12:00:00",
  });
  const sections = sectionsWith(label);
  await createDraft(checklistId, sections);
  const version = await publishVersion(checklistId);
  return {
    code: station.stationCode,
    stationId: station.stationId,
    checklistId,
    versionId: version.id,
    sections,
  };
}

function fullAnswers(sections: Section[]): unknown[] {
  const items = sections[0]?.items ?? [];
  return [
    { itemId: items[0]?.id, value: true, at: STARTED_AT },
    { itemId: items[1]?.id, value: 3, at: STARTED_AT },
  ];
}

const WAIT_FOR_WAITER_MS = 5_000;
const WAIT_POLL_MS = 20;

/**
 * Ждёт, пока кто-то встанет в очередь за транзакцией `xid` — или пока отправка
 * не закончится сама, ни за кем не встав.
 *
 * Очередь за чужой транзакцией и есть признак того, что база взяла гонку на себя:
 * вставка той же пары «версия + начало» не может ни пройти, ни отказать, пока
 * первая запись не зафиксирована или не отменена. Отправка, закончившаяся без
 * очереди, означает, что правила в базе нет и вторая запись уже легла.
 */
async function waitForWaiterOrSettle(
  xid: string,
  isSettled: () => boolean,
): Promise<void> {
  const deadline = Date.now() + WAIT_FOR_WAITER_MS;
  while (!isSettled()) {
    const result = await getDb().execute<{ waiting: boolean }>(sql`
      select exists (
        select 1 from pg_locks
        where locktype = 'transactionid'
          and transactionid = ${xid}::xid
          and not granted
      ) as waiting`);
    if (result.rows[0]?.waiting === true) return;
    if (Date.now() > deadline) {
      throw new Error(
        "Вторая отправка не закончилась и не встала в очередь за первой записью: зависла где-то ещё",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
  }
}

/** Начало заполнения, которое сервер прочтёт из этого пропуска. */
function startedAtOf(ticket: string, code: string, versionId: string): Date {
  const pass = readFillTicket(ticket, { code, versionId }, NOW);
  if (!pass.ok) throw new Error(`Пропуск не читается: ${pass.reason}`);
  return new Date(pass.value);
}

describe("отправка заполнения", () => {
  beforeEach(() => {
    forgetAllFillHits();
  });

  it("сохраняет заполнение и отвечает временем и длительностью с сервера", async () => {
    // Arrange
    const target = await stand("сохранение");

    // Act
    const outcome = await submitFilling(
      {
        code: target.code,
        versionId: target.versionId,
        ticket: ticketFor(target.code, target.versionId),
        answers: fullAnswers(target.sections),
      },
      NOW,
    );

    // Assert
    expect(outcome.kind).toBe("saved");
    if (outcome.kind !== "saved") return;
    expect(outcome.failedCritical).toBe(0);
    expect(outcome.durationMs).toBeGreaterThan(0);

    const [row] = await listSubmissions({
      stationId: target.stationId,
      limit: 1,
    });
    expect(row?.versionId).toBe(target.versionId);
  });

  it("считает проваленные критичные пункты для экрана «отправлено»", async () => {
    const target = await stand("провал");
    const items = target.sections[0]?.items ?? [];

    const outcome = await submitFilling(
      {
        code: target.code,
        versionId: target.versionId,
        ticket: ticketFor(target.code, target.versionId),
        answers: [
          {
            itemId: items[0]?.id,
            value: false,
            comment: "печь не греет, вызвал техника",
            at: STARTED_AT,
          },
          { itemId: items[1]?.id, value: 3, at: STARTED_AT },
        ],
      },
      NOW,
    );

    expect(outcome).toMatchObject({ kind: "saved", failedCritical: 1 });
  });
});

describe("гонка с публикацией новой версии", () => {
  beforeEach(() => {
    forgetAllFillHits();
  });

  it("пишет на ту версию, что была отдана клиенту, а не на свежую", async () => {
    // Arrange: сотрудник открыл экран и получил первую версию.
    const target = await stand("гонка");
    const given = target.versionId;
    const givenItems = target.sections[0]?.items ?? [];

    // Пока он заполнял, методист поменял черновик и опубликовал вторую версию.
    const nextSections = sectionsWith("новая");
    await getDb()
      .update(checklistVersions)
      .set({ sections: nextSections })
      .where(
        and(
          eq(checklistVersions.checklistId, target.checklistId),
          eq(checklistVersions.status, "draft"),
        ),
      );
    const published = await publishVersion(target.checklistId);
    expect(published.id).not.toBe(given);

    // Act: отправка уходит с тем идентификатором версии, что был на экране.
    const outcome = await submitFilling(
      {
        code: target.code,
        versionId: given,
        ticket: ticketFor(target.code, given),
        answers: [
          { itemId: givenItems[0]?.id, value: true, at: STARTED_AT },
          { itemId: givenItems[1]?.id, value: 3, at: STARTED_AT },
        ],
      },
      NOW,
    );

    // Assert: запись легла на прежнюю версию, и снимок — её пункты, а не новые.
    expect(outcome.kind).toBe("saved");
    const [row] = await listSubmissions({
      stationId: target.stationId,
      limit: 1,
    });
    expect(row?.versionId).toBe(given);

    const detail = await getSubmission(row?.id ?? "");
    expect(detail?.snapshot[0]?.items[0]?.id).toBe(givenItems[0]?.id);
    expect(detail?.snapshot[0]?.items[0]?.id).not.toBe(
      nextSections[0]?.items[0]?.id,
    );
  });
});

describe("защита публичной точки записи", () => {
  beforeEach(() => {
    forgetAllFillHits();
  });

  it("отбивает кривое тело запроса, не трогая базу", async () => {
    const outcome = await submitFilling({ мусор: true }, NOW);

    expect(outcome).toStrictEqual({
      kind: "refused",
      reason: "malformed",
      retryAfterSeconds: 0,
    });
  });

  it("неизвестный и перевыпущенный код получают один и тот же отказ", async () => {
    const target = await stand("отказ");

    const unknown = await submitFilling(
      {
        code: "zzzzzzzzzz",
        versionId: target.versionId,
        // Пропуск выписан на ТОТ ЖЕ несуществующий код: иначе отправка остановилась
        // бы на подписи и до похода в базу не дошла, то есть проверялось бы не то.
        ticket: ticketFor("zzzzzzzzzz", target.versionId),
        answers: fullAnswers(target.sections),
      },
      NOW,
    );

    expect(unknown).toMatchObject({ kind: "refused", reason: "unknown-code" });
  });

  it("не даёт писать заполнение на версию чужой станции", async () => {
    // Один живой код с наклейки не должен открывать историю всей сети.
    const mine = await stand("своя");
    const other = await stand("чужая");

    const outcome = await submitFilling(
      {
        code: mine.code,
        versionId: other.versionId,
        ticket: ticketFor(mine.code, other.versionId),
        answers: fullAnswers(other.sections),
      },
      NOW,
    );

    expect(outcome).toMatchObject({ kind: "refused", reason: "unknown-code" });
  });

  it("не записывает проваленный критичный пункт без комментария", async () => {
    const target = await stand("без комментария");
    const items = target.sections[0]?.items ?? [];

    const outcome = await submitFilling(
      {
        code: target.code,
        versionId: target.versionId,
        ticket: ticketFor(target.code, target.versionId),
        answers: [{ itemId: items[0]?.id, value: false, at: STARTED_AT }],
      },
      NOW,
    );

    expect(outcome).toMatchObject({
      kind: "refused",
      reason: "comment-required",
    });
  });

  it("отсекает поток отправок с одного кода и говорит, когда повторить", async () => {
    const target = await stand("поток");
    // Каждая отправка — со своим пропуском: с одним и тем же это был бы повтор
    // одного заполнения, а не поток, и предел частоты проверялся бы вхолостую.
    const body = () => ({
      code: target.code,
      versionId: target.versionId,
      ticket: ticketFor(target.code, target.versionId),
      answers: fullAnswers(target.sections),
    });
    for (let index = 0; index < FILL_LIMITS.submitPerCode.maxHits; index += 1) {
      expect((await submitFilling(body(), NOW)).kind).toBe("saved");
    }

    const outcome = await submitFilling(body(), NOW);

    expect(outcome.kind).toBe("refused");
    if (outcome.kind !== "refused") return;
    expect(outcome.reason).toBe("rate-limited");
    expect(outcome.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("длительность заполнения не назначается телом запроса", async () => {
    // D003 снял гео и пороги скорости, оставив длительность единственным признаком
    // добросовестности, который продукт вообще показывает управляющему. Признак,
    // который отправитель называет сам, не значит ничего — но выглядит значащим,
    // и это хуже, чем его отсутствие.
    //
    // Проверка написана в обход устройства приёма: она спрашивает не «есть ли
    // пропуск», а «может ли тело назначить длительность». Поэтому она переживёт
    // смену способа и останется той же проверкой.
    // Время здесь настоящее, а не `NOW`: отметку отправки ставит база своими часами,
    // и длительность сравнима с нулём только тогда, когда оба конца отрезка живут
    // в одних сутках. С выдуманным «сейчас» проверка мерила бы расстояние до
    // сегодняшней даты и зеленела бы от чего угодно.
    const realNow = new Date();
    const target = await stand("подделка длительности");
    const forgedStart = realNow.getTime() - 3 * 60 * 60 * 1000;

    const outcome = await submitFilling(
      {
        code: target.code,
        versionId: target.versionId,
        // Пропуск настоящий: экран человек открыл честно, а «начало» дописал в тело.
        ticket: ticketFor(target.code, target.versionId, realNow),
        startedAt: forgedStart,
        answers: fullAnswers(target.sections),
      },
      realNow,
    );

    // Отправка принимается — лишнее поле не повод терять работу сотрудника, —
    // но длительность считает сервер, а не тело.
    expect(outcome.kind).toBe("saved");
    if (outcome.kind !== "saved") return;
    expect(outcome.durationMs).toBeLessThan(60 * 1000);
    const [row] = await listSubmissions({
      stationId: target.stationId,
      limit: 1,
    });
    expect(row?.durationMs ?? 0).toBeLessThan(60 * 1000);
  });

  it("повторная отправка того же заполнения не заводит второй записи", async () => {
    // Кнопка на экране от двойного нажатия защищена (гасится и отсоединяется),
    // но тело отправляет кто угодно, да и сам продукт предлагает повтор: при
    // обрыве связи на ответе сотрудник нажимает «отправить ещё раз» с тем же
    // телом (критерий готовности 7). Второй записи в ленте от этого быть не должно.
    const target = await stand("повтор");
    const body = {
      code: target.code,
      versionId: target.versionId,
      ticket: ticketFor(target.code, target.versionId),
      answers: fullAnswers(target.sections),
    };

    const first = await submitFilling(body, NOW);
    const second = await submitFilling(body, NOW);

    expect(first.kind).toBe("saved");
    // Повтор не наказывается отказом: работа сотрудника принята, и сказать ему
    // надо именно это, а не «сломалось».
    expect(second.kind).toBe("saved");
    const rows = await listSubmissions({
      stationId: target.stationId,
      limit: 10,
    });
    expect(rows.length).toBe(1);
  });

  it("отправка, пришедшая, пока первая ещё пишется, получает квитанцию первой, а не вторую запись", async () => {
    // Повтор после подвисшего ответа или ретрай прокси приходит, пока первая
    // запись ещё не зафиксирована. Проверка на повтор такую запись не видит и
    // отвечает «не найдено» — до T219 второй запрос шёл сохранять свою, и в ленте
    // управляющего одна работа стояла дважды. Окно между «записала» и
    // «зафиксировала» здесь удержано открытой транзакцией, поэтому гонка
    // воспроизводится каждый прогон, а не когда повезёт.
    const target = await stand("подвисший ответ");
    const ticket = ticketFor(target.code, target.versionId);
    const body = {
      code: target.code,
      versionId: target.versionId,
      ticket,
      answers: fullAnswers(target.sections),
    };

    let second: Promise<SubmitOutcome> | undefined;
    let isSecondSettled = false;
    const firstId = await getDb().transaction(async (tx) => {
      const [first] = await tx
        .insert(submissions)
        .values({
          versionId: target.versionId,
          stationId: target.stationId,
          snapshot: target.sections,
          answers: [],
          startedAt: startedAtOf(ticket, target.code, target.versionId),
        })
        .returning({ id: submissions.id });
      if (first === undefined) throw new Error("Первая запись не легла");
      const xid = await tx.execute<{ xid: string }>(
        sql`select pg_current_xact_id()::xid::text as xid`,
      );

      second = submitFilling(body, NOW).finally(() => {
        isSecondSettled = true;
      });
      await waitForWaiterOrSettle(
        xid.rows[0]?.xid ?? "",
        () => isSecondSettled,
      );
      return first.id;
    });

    const outcome = await second;
    const saved = await getSubmission(firstId);
    // Проигравший гонку видит то же, что увидел бы при обычном повторе: работа
    // принята, время — той записи, что легла в историю. Не страница ошибки и не
    // «нет связи», после которого сотрудник нажал бы «отправить» ещё раз.
    expect(outcome?.kind).toBe("saved");
    if (outcome?.kind !== "saved") return;
    expect(outcome.submittedAt).toBe(saved?.submittedAt.getTime());
    const rows = await listSubmissions({
      stationId: target.stationId,
      limit: 10,
    });
    expect(rows.map((row) => row.id)).toStrictEqual([firstId]);
  });

  it("пачка одновременных отправок одного заполнения даёт одну запись и одну квитанцию на всех", async () => {
    // Та же гонка без удержания окна: запросы идут разом через общий пул, как
    // пришли бы двойное касание и ретрай прокси поверх него.
    const target = await stand("пачка");
    const body = {
      code: target.code,
      versionId: target.versionId,
      ticket: ticketFor(target.code, target.versionId),
      answers: fullAnswers(target.sections),
    };

    const outcomes = await Promise.all(
      Array.from({ length: 6 }, () => submitFilling(body, NOW)),
    );

    const rows = await listSubmissions({
      stationId: target.stationId,
      limit: 10,
    });
    expect(rows.length).toBe(1);
    const receipts = new Set(
      outcomes.map((outcome) =>
        outcome.kind === "saved" ? outcome.submittedAt : outcome.kind,
      ),
    );
    expect([...receipts]).toStrictEqual([rows[0]?.submittedAt.getTime()]);
  });

  it("перебор кодов не отдаёт ничего, кроме отказа", async () => {
    // Опора критерия готовности 8. В ответе на подобранный код не должно быть
    // ни намёка на то, есть ли такая станция, что на ней за чек-лист и была ли она.
    const target = await stand("перебор");

    const answers: unknown[] = [];
    for (let index = 0; index < 20; index += 1) {
      answers.push(
        await submitFilling(
          {
            code: `guess${String(index).padStart(5, "0")}`,
            versionId: target.versionId,
            ticket: ticketFor(
              `guess${String(index).padStart(5, "0")}`,
              target.versionId,
            ),
            answers: fullAnswers(target.sections),
          },
          NOW,
        ),
      );
    }

    const serialized = JSON.stringify(answers);
    expect(serialized).not.toContain("Печь");
    expect(serialized).not.toContain("saved");
    expect(serialized).not.toContain(target.code);
    expect(serialized).not.toContain(target.versionId);
    for (const outcome of answers) {
      expect(Object.keys(outcome as object).sort()).toStrictEqual([
        "kind",
        "reason",
        "retryAfterSeconds",
      ]);
    }
  });
});
