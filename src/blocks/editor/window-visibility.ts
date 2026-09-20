// Увидит ли сотрудник опубликованную версию СЕЙЧАС — или только когда окно откроется.
//
// Зачем это редактору. Окно чек-листа — единственный механизм выбора того, что откроет
// QR станции (D004, D026), и до T275 редактор о нём молчал: форма заведения подставляет
// первое окно списка (06:00–11:00), поэтому методист, публикующий в 11:30, отдавал на
// станцию версию, которую сегодня уже никто не увидит. Единственной обратной связью был
// экран сотрудника («на это время суток станции не назначен ни один чек-лист») — то есть
// методист узнавал о промахе через смену, от человека.
//
// Правило окна здесь НЕ переписывается. Открытость считает `offsetInWindow` блока `data` —
// та же чистая функция, которой пользуется расписание обходов, и тот же разбор границ
// (`parseLocalTime`, `windowLength`), что понимает «24:00» и переход через полночь.
// Второй способ ответить на вопрос «окно открыто?» разошёлся бы с первым молча, а
// расходится он ровно в тех случаях, ради которых предупреждение и заводится.
//
// Местное время сюда ПРИХОДИТ и не считается: часовой пояс применяет PostgreSQL (D026),
// второго календаря в JavaScript продукт не заводит.
import {
  formatLocalTime,
  offsetInWindow,
  parseLocalTime,
  windowLength,
} from "@/blocks/data/schedule";

import type { WindowValue } from "./window-field";

/** Что сказать методисту об окне рядом с публикацией. */
export interface WindowVisibility {
  /** Окно идёт сейчас: опубликованную версию сотрудник увидит сразу. */
  readonly open: boolean;
  /** Начало окна, «06:00» — с этого времени версию увидят. */
  readonly opensAt: string;
  /** Окно откроется не сегодня, а завтра: сегодня оно уже прошло. */
  readonly tomorrow: boolean;
}

/**
 * Закрытое окно так, как о нём говорит экран: всё, что попадёт в текст сообщения.
 *
 * Отдельный от `WindowVisibility` тип, потому что он ПЕРЕЕЗЖАЕТ с сервера в браузер
 * состоянием серверного действия: после публикации экран обязан назвать то время
 * пиццерии, которое было на сервере в миг публикации, а не то, что страница посчитала
 * при отрисовке полчаса назад.
 */
export interface ClosedWindow {
  /** Местное время пиццерии в миг проверки, «11:30». */
  readonly now: string;
  readonly start: string;
  readonly end: string;
  /** Начало окна — время, с которого версию увидят. */
  readonly opensAt: string;
  /** Откроется завтра, а не сегодня. */
  readonly tomorrow: boolean;
}

/**
 * Вердикт об окне по местному времени ПИЦЦЕРИИ.
 *
 * `null` — вердикта нет: время или граница окна непонятны. Промолчать здесь честнее,
 * чем назвать час: предупреждение, посчитанное по выдуманному времени, увело бы
 * методиста от настоящей причины.
 */
export function windowVisibility(
  window: WindowValue,
  localTime: string,
): WindowVisibility | null {
  const startMinutes = parseLocalTime(window.start);
  const nowMinutes = parseLocalTime(localTime);
  if (startMinutes === null || nowMinutes === null) return null;
  if (windowLength(window) === null) return null;

  const open = offsetInWindow(window, localTime) !== null;

  return {
    open,
    // Через `formatLocalTime`, а не обрезкой строки: время из базы приходит как
    // «06:00:00», и на экране методиста секундам делать нечего.
    opensAt: formatLocalTime(startMinutes),
    // Окно закрыто и его начало уже позади — значит следующее открытие завтра.
    // Равенства здесь быть не может: время, равное началу, попадает в окно.
    tomorrow: !open && startMinutes < nowMinutes,
  };
}

/**
 * Сообщение о закрытом окне — или `null`, когда говорить нечего: окно открыто либо
 * время непонятно.
 *
 * Собрано одной функцией, а не в двух местах экрана, потому что спрашивают её двое:
 * подсказка у станции (до нажатия) и состояние действия публикации (после). Два
 * одинаковых сбора этого сообщения разъехались бы молча — ровно как разъезжаются
 * две копии правила.
 */
export function closedWindowNotice(
  window: WindowValue,
  localTime: string,
): ClosedWindow | null {
  const verdict = windowVisibility(window, localTime);
  if (verdict === null || verdict.open) return null;

  return {
    now: localTime,
    start: window.start,
    end: window.end,
    opensAt: verdict.opensAt,
    tomorrow: verdict.tomorrow,
  };
}
