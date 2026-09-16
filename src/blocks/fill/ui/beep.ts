/**
 * Гудок кухонного планшета: три коротких сигнала — узнаваемо и не пугает кухню.
 *
 * Один на двоих, кто звонит на экране заполнения: панель будильников (D070) и сигнал
 * станции о пропущенной проверке (T138, D068). Две копии этого кода разъехались бы по
 * громкости и длительности, и сотрудник слышал бы два разных звука от одного планшета.
 *
 * Звук может не пойти: браузер не даёт звучать странице, на которой ещё никто ничего не
 * нажимал. Это не глотание ошибки — плашка на экране остаётся в любом случае, и именно
 * она, а не звук, сообщает о сигнале. Вернувшееся `false` говорит вызывающему, что звук
 * не пошёл, и он пишет об этом прямо в плашке.
 */

const BEEPS = 3;
const BEEP_SECONDS = 0.18;
const BEEP_GAP_SECONDS = 0.28;
const BEEP_HZ = 880;
const BEEP_GAIN = 0.12;

export async function beep(): Promise<boolean> {
  try {
    // Обращение внутри try намеренно: в среде без Web Audio это бросит, и ветка
    // «звука нет» одна на оба случая — нет поддержки и не дали звучать.
    const ctx = new globalThis.AudioContext();
    // Состояние спрашивается ПОСЛЕ того, как разрешение доиграно: сразу после вызова
    // оно ещё «suspended» всегда, и панель писала бы «звука нет» даже там, где звук
    // пошёл. Надпись, которая врёт в половине случаев, учит не читать панель вовсе.
    await ctx.resume();
    if (ctx.state !== "running") return false;

    for (let index = 0; index < BEEPS; index++) {
      const start = ctx.currentTime + index * BEEP_GAP_SECONDS;
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      tone.frequency.value = BEEP_HZ;
      gain.gain.value = BEEP_GAIN;
      tone.connect(gain).connect(ctx.destination);
      tone.start(start);
      tone.stop(start + BEEP_SECONDS);
    }
    return true;
  } catch {
    return false;
  }
}
