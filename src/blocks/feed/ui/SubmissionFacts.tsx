import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { formatDuration } from "../format";
import type { SubmissionModel } from "../model";

/**
 * Полоса фактов заполнения (эталон `.facts` в submission.html): когда начато, когда
 * отправлено, сколько заняло, сколько пунктов реально выполнено и в каком режиме смены.
 * Числа уже посчитала модель (T046) — здесь только формат под экран, без счёта.
 *
 * Время показывается в поясе ПИЦЦЕРИИ (`model.timeZone`), а не сервера: сотрудник
 * видел на кухне местное время, и управляющий должен видеть то же самое.
 *
 * Фактов ПЯТЬ, а эталон рисует четыре колонки: пятый добавило решение D055 («режим
 * смены»), и эталон здесь просто старше решения — содержательное расхождение признано
 * записью в `docs/furca/design/map.md`. Раскладка под пятый факт — уже не расхождение,
 * а задача T171: на четырёх колонках пятая ячейка вставала одна во втором ряду,
 * шириной в четверть и с левой границей, упирающейся в пустоту.
 */

const CARD_CLASS =
  "bg-surface overflow-hidden rounded-[var(--r-block)] border border-[var(--line-strong)] shadow-[var(--sh-xs)]";

/**
 * Колонки по ширине: 1 → 2 → 3 → 5, и ни на одной из них ряд не остаётся неполным.
 *
 * На телефоне колонка ОДНА, и это не перестраховка: боковое меню кабинета
 * съедает 208 из 375 px, и под полосу остаётся около 117 px на всё. Две колонки
 * здесь дают ячейки по 58 px, в которые подпись не влезает, — а карточка режет
 * переполнение (`overflow-hidden` ради скруглённых углов), то есть «отправлено»
 * просто становится «отправл», и полоса при этом выглядит целой. Найдено сверкой
 * с эталоном и закрыто проверкой «содержимое не шире ячейки»; `overflow-wrap: anywhere`
 * на значении и подписи держит то же свойство и для чужих языков, где слова длиннее.
 *
 * Разделители сделаны не границей на ячейке (как на эталоне), а зазором в 1 px, сквозь
 * который виден фон сетки. Причина ровно в переносе: `border-left` при переносе остаётся
 * висеть в начале нового ряда — это и был дефект T171, — а зазор рисует линию только
 * ТАМ, ГДЕ ячейки соседствуют, и сам добавляет горизонтальную линию между рядами.
 * На широком экране вид тот же, что на эталоне: четыре вертикальных волоска в 1 px.
 */
const GRID_CLASS =
  "grid grid-cols-1 gap-px bg-[var(--line)] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5";
const CELL_CLASS = "bg-surface p-[var(--space-7)]";
/**
 * Пятая ячейка занимает остаток ряда там, где иначе осталась бы пустая клетка:
 * на двух колонках она третий ряд целиком, на трёх — две трети второго. На одной
 * колонке растягивать нечего, и `col-span-2` там запрещён нарочно: он создал бы
 * вторую, неявную колонку и раздвинул сетку шире карточки. Иначе ряд обрывается
 * на середине, а незанятая клетка сетки светит фоном-разделителем вместо ячейки.
 */
const CELL_WIDE_CLASS = `${CELL_CLASS} sm:col-span-2 lg:col-span-1`;
const VALUE_CLASS =
  "text-[length:var(--fs-title)] leading-[1.2] font-semibold [overflow-wrap:anywhere]";
const CAPTION_CLASS =
  "mt-[var(--space-2)] text-[length:var(--fs-meta)] text-[var(--ink-3)] [overflow-wrap:anywhere]";

// Пояснение под показателями: сколько пунктов снимка в этом режиме не спрашивали.
// Без него «выполнено 1 из 1» рядом с чек-листом на тридцать пунктов выглядит ложью.
const SKIPPED_CLASS =
  "border-t border-[var(--line)] px-[var(--cell-pad-x)] py-[var(--space-5)] text-[length:var(--fs-dense)] text-[var(--ink-2)]";

interface FactProps {
  readonly value: string;
  readonly caption: string;
  /** Ячейка занимает остаток ряда: так последний факт не остаётся обрезком. */
  readonly wide: boolean;
}

function Fact({ value, caption, wide }: FactProps): ReactElement {
  return (
    <div
      className={wide ? CELL_WIDE_CLASS : CELL_CLASS}
      data-testid="submission-fact"
    >
      <div className={VALUE_CLASS}>{value}</div>
      <div className={CAPTION_CLASS}>{caption}</div>
    </div>
  );
}

export async function SubmissionFacts({
  model,
}: {
  readonly model: SubmissionModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.card");
  const format = await getFormatter();

  const time = (at: Date): string =>
    format.dateTime(at, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: model.timeZone,
    });

  return (
    <div className={CARD_CLASS} data-testid="submission-facts">
      <div className={GRID_CLASS}>
        <Fact
          value={time(model.startedAt)}
          caption={t("startedAt")}
          wide={false}
        />
        <Fact
          value={time(model.submittedAt)}
          caption={t("submittedAt")}
          wide={false}
        />
        <Fact
          value={formatDuration(model.durationMs)}
          caption={t("duration")}
          wide={false}
        />
        <Fact
          value={t("doneValue", {
            done: model.doneCount,
            total: model.itemCount,
          })}
          caption={t("done")}
          wide={false}
        />
        <Fact value={t(`mode.${model.mode}`)} caption={t("modeLabel")} wide />
      </div>
      {model.skippedByModeCount === 0 ? null : (
        <p data-testid="skipped-by-mode" className={SKIPPED_CLASS}>
          {t("skippedByMode", { count: model.skippedByModeCount })}
        </p>
      )}
    </div>
  );
}
