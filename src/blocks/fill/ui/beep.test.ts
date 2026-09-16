// Гудок дергает настоящий Web Audio, которого в среде vitest (environment: "node") нет —
// поэтому здесь не мокается один метод, а целиком подменяется globalThis.AudioContext на
// заглушку, которая записывает, что у неё попросили. Заглушка возвращается на место в
// afterEach: тестовая база общая, и вырвавшаяся подмена искажала бы соседние файлы прогона.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { beep } from "./beep";

type AudioContextCtor = typeof globalThis.AudioContext;

// Контракт гудка (D070/T138): три тона по 880 Гц, громкость 0.12, каждый следующий
// стартует на 0.28 с позже предыдущего и звучит 0.18 с. Числа вынесены в константы,
// чтобы падение проверки называло значение, а не голую цифру в expect().
const EXPECTED_TONE_COUNT = 3;
const EXPECTED_FREQUENCY_HZ = 880;
const EXPECTED_GAIN = 0.12;
const EXPECTED_GAP_SECONDS = 0.28;
const EXPECTED_TONE_SECONDS = 0.18;

/** Место, куда в реальном Web Audio утекает звук; для проверки связей достаточно метки. */
interface StubDestinationNode {
  readonly kind: "destination";
}

interface StubGainNode {
  readonly gain: { value: number };
  connectedTo: StubDestinationNode | null;
  connect(destination: StubDestinationNode): StubDestinationNode;
}

interface StubOscillatorNode {
  readonly frequency: { value: number };
  connectedTo: StubGainNode | null;
  startedAt: number | null;
  stoppedAt: number | null;
  connect(destination: StubGainNode): StubGainNode;
  start(when: number): void;
  stop(when: number): void;
}

/** И осциллятор, и узел громкости просто запоминают, к чему их подключили. */
function recordConnection<Target>(
  node: { connectedTo: Target | null },
  target: Target,
): Target {
  node.connectedTo = target;
  return target;
}

interface StubContextConfig {
  /** Каким `ctx.currentTime` заглушка отвечает — ненулевым, иначе потеря слагаемого
   * `currentTime` в расчёте старта тона осталась бы незамеченной. */
  readonly currentTime: number;
  /** Состояние после resume(): "running" — разрешили, "suspended" — нет. */
  readonly stateAfterResume: "running" | "suspended";
  /** Сама resume() отказывает (площадка не даёт даже попытаться), а не просто не помогает. */
  readonly resumeRejects?: boolean;
}

/** Заглушка AudioContext с учётом того, что у неё попросили: тоны, узлы, их связи. */
function createAudioContextStub(config: StubContextConfig): {
  Ctor: new () => object;
  oscillators: StubOscillatorNode[];
  gains: StubGainNode[];
  destination: StubDestinationNode;
} {
  const oscillators: StubOscillatorNode[] = [];
  const gains: StubGainNode[] = [];
  const destination: StubDestinationNode = { kind: "destination" };

  class Ctor {
    state: "suspended" | "running" = "suspended";
    readonly currentTime = config.currentTime;
    readonly destination = destination;

    resume(): Promise<void> {
      if (config.resumeRejects) {
        return Promise.reject(
          new Error("разрешение на звук отклонено площадкой"),
        );
      }
      this.state = config.stateAfterResume;
      return Promise.resolve();
    }

    createOscillator(): StubOscillatorNode {
      const node: StubOscillatorNode = {
        frequency: { value: 0 },
        connectedTo: null,
        startedAt: null,
        stoppedAt: null,
        connect: (target) => recordConnection(node, target),
        start: (when) => {
          node.startedAt = when;
        },
        stop: (when) => {
          node.stoppedAt = when;
        },
      };
      oscillators.push(node);
      return node;
    }

    createGain(): StubGainNode {
      const node: StubGainNode = {
        gain: { value: 0 },
        connectedTo: null,
        connect: (target) => recordConnection(node, target),
      };
      gains.push(node);
      return node;
    }
  }

  return { Ctor, oscillators, gains, destination };
}

function installAudioContext(Ctor: new () => object): void {
  globalThis.AudioContext = Ctor as unknown as AudioContextCtor;
}

/** Заглушка, которая ведёт себя как AudioContext, недоступный в этой среде вовсе:
 * бросает уже на конструкторе, до какого-либо состояния. */
function ThrowingAudioContext(): never {
  throw new Error("AudioContext недоступен в этой среде");
}

describe("beep", () => {
  let savedAudioContext: AudioContextCtor | undefined;

  beforeEach(() => {
    savedAudioContext = globalThis.AudioContext;
  });

  afterEach(() => {
    globalThis.AudioContext = savedAudioContext as unknown as AudioContextCtor;
  });

  it("звук пошёл: три тона, каждый через свой узел громкости идёт на выход", async () => {
    const stub = createAudioContextStub({
      currentTime: 5,
      stateAfterResume: "running",
    });
    installAudioContext(stub.Ctor);

    const result = await beep();

    expect(result).toBe(true);
    expect(stub.oscillators).toHaveLength(EXPECTED_TONE_COUNT);
    expect(stub.gains).toHaveLength(EXPECTED_TONE_COUNT);
    for (const [index, oscillator] of stub.oscillators.entries()) {
      const gain = stub.gains[index];
      expect(oscillator.connectedTo).toBe(gain);
      expect(gain?.connectedTo).toBe(stub.destination);
    }
  });

  it("три гудка идут друг за другом, а не разом", async () => {
    // currentTime = 5, чтобы проверка ловила и потерю самого слагаемого currentTime,
    // а не только потерю шага между тонами (с currentTime = 0 обе ошибки выглядели бы одинаково).
    const stub = createAudioContextStub({
      currentTime: 5,
      stateAfterResume: "running",
    });
    installAudioContext(stub.Ctor);

    await beep();

    for (const [index, oscillator] of stub.oscillators.entries()) {
      const expectedStart = 5 + index * EXPECTED_GAP_SECONDS;
      expect(oscillator.startedAt).toBe(expectedStart);
      expect(oscillator.stoppedAt).toBe(expectedStart + EXPECTED_TONE_SECONDS);
    }
  });

  it("частота и громкость — те, что задумывались, а не что попало по умолчанию", async () => {
    const stub = createAudioContextStub({
      currentTime: 5,
      stateAfterResume: "running",
    });
    installAudioContext(stub.Ctor);

    await beep();

    for (const oscillator of stub.oscillators) {
      expect(oscillator.frequency.value).toBe(EXPECTED_FREQUENCY_HZ);
    }
    for (const gain of stub.gains) {
      expect(gain.gain.value).toBe(EXPECTED_GAIN);
    }
  });

  it("разрешения не дали: state остался suspended — тишина, а не игра в никуда", async () => {
    // resume() отрабатывает без ошибки, но браузер всё равно не пустил звук —
    // это отдельный от отказа resume() случай, и по спеке оба должны гасить звук молча.
    const stub = createAudioContextStub({
      currentTime: 5,
      stateAfterResume: "suspended",
    });
    installAudioContext(stub.Ctor);

    const result = await beep();

    expect(result).toBe(false);
    expect(stub.oscillators).toHaveLength(0);
  });

  it("Web Audio в среде нет вовсе: false без брошенного исключения", async () => {
    globalThis.AudioContext = undefined as unknown as AudioContextCtor;

    await expect(beep()).resolves.toBe(false);
  });

  it("конструктор AudioContext бросает: false, а не необработанная ошибка", async () => {
    globalThis.AudioContext =
      ThrowingAudioContext as unknown as AudioContextCtor;

    await expect(beep()).resolves.toBe(false);
  });

  it("resume() отклонён: false, звук не пошёл", async () => {
    const stub = createAudioContextStub({
      currentTime: 5,
      stateAfterResume: "running",
      resumeRejects: true,
    });
    installAudioContext(stub.Ctor);

    const result = await beep();

    expect(result).toBe(false);
    expect(stub.oscillators).toHaveLength(0);
  });
});
