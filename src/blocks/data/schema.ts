// Схема данных продукта: справочник (страна → пиццерия → станция), чек-листы
// с неизменяемыми версиями и заполнения. Источник истины для миграций.
//
// Правила целостности живут здесь, в базе, а не в коде:
//   · одна опубликованная версия на чек-лист и один черновик — частичные уникальные индексы;
//   · удаление страны, пиццерии, станции и версии запрещено, пока на них ссылается история
//     (принцип 3: история заполнений неприкосновенна).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { LOCALES } from "@/blocks/core/locale";

import type {
  Answer,
  AnswerValue,
  Item,
  LocalizedText,
  Section,
  ShiftMode,
  VersionStatus,
} from "./types";

const CREATED_AT = "created_at";

// Верхние границы JSONB стоят в самой базе, а не только в коде: `submissions` —
// единственная таблица, куда пишет неопознанный человек из интернета, и забытая
// проверка в блоке fill не должна означать, что база примет что угодно.
// Числа взяты с запасом от измеренного: чек-лист станции на 50 пунктов с двумя
// языками и подсказками занимает 22 КБ, ответы на него с комментариями — 7 КБ
// (замерено `pg_column_size` на PostgreSQL 17). Чек-лист — единицы-десятки пунктов
// (принципы 1 и 2), поэтому предел заведомо недостижим в работе и остаётся заслоном
// от мусора. `pg_column_size` внутри CHECK видит несжатый размер значения, так что
// граница не зависит от того, насколько удачно сжался вход.
const SECTIONS_MAX_BYTES = 262_144; // 256 КиБ — двенадцатикратный запас к 22 КБ
const ANSWERS_MAX_BYTES = 65_536; // 64 КиБ — девятикратный запас к 7 КБ
// Отметка обхода — одно значение пункта: «да», число или короткая строка. Здесь предел
// нужен на строку, а не на весь документ: строк за смену сотни, и каждая приходит с
// той же публичной страницы, что и заполнение.
const CHECK_VALUE_MAX_BYTES = 4_096; // 4 КиБ на одно значение
const CHECK_COMMENT_MAX_LENGTH = 2_000;
// Подпись будильника. В базе — заслон, а не рабочая мерка: рабочий предел вдвое меньше
// и стоит в блоке fill (`FILL_INPUT_LIMITS.maxAlarmLabelLength`), как у комментария
// к ответу (500 в блоке против 2000 здесь). Строку сюда пишет неопознанный человек
// из интернета, и забытая проверка в блоке не должна означать, что база примет что угодно.
const ALARM_LABEL_MAX_LENGTH = 240;

function jsonbSizeLimit(column: string, maxBytes: number) {
  return sql.raw(`pg_column_size(${column}) <= ${String(maxBytes)}`);
}

/** Серверное время: все отметки берутся из `now()` базы, а не с устройства. */
function serverTimestamp(name: string) {
  return timestamp(name, { withTimezone: true }).notNull().defaultNow();
}

export const countries = pgTable(
  "countries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Язык страны — запасной для экрана заполнения, когда язык устройства не поддержан.
    locale: text("locale").notNull().default("en"),
    createdAt: serverTimestamp(CREATED_AT),
  },
  // Список языков — из core, а не буквами: иначе третий язык добавлен в продукт,
  // а база его молча отвергает (T268). Значения подставляются через `sql.raw`, потому
  // что это имена в тексте ограничения, а не параметры запроса; подставляются они из
  // константы продукта, а не из ввода.
  () => [
    check(
      "countries_locale",
      sql`locale in (${sql.raw(LOCALES.map((code) => `'${code}'`).join(", "))})`,
    ),
  ],
);

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Часовой пояс пиццерии: по нему окно чек-листа сравнивается с местным временем,
    // иначе утренний чек-лист в Казахстане открывался бы днём.
    timezone: text("timezone").notNull().default("UTC"),
    createdAt: serverTimestamp(CREATED_AT),
  },
  (table) => [index("stores_country_idx").on(table.countryId)],
);

export const stations = pgTable(
  "stations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Код из ссылки QR. Уникален и перевыпускается (D006): выпуск фиксируется временем.
    code: text("code").notNull().unique(),
    codeIssuedAt: serverTimestamp("code_issued_at"),
    createdAt: serverTimestamp(CREATED_AT),
  },
  (table) => [index("stations_store_idx").on(table.storeId)],
);

export const checklists = pgTable(
  "checklists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Станция может быть не назначена: чек-лист заводится и привязывается отдельно,
    // а удаление станции отвязывает чек-лист, но не удаляет ни его, ни историю.
    stationId: uuid("station_id").references(() => stations.id, {
      onDelete: "set null",
    }),
    title: jsonb("title").$type<LocalizedText>().notNull(),
    // Окно времени вместо расписания смен (D004): утренний чек-лист утром, вечерний вечером.
    windowStart: time("window_start").notNull(),
    windowEnd: time("window_end").notNull(),
    // Снят с работы: методист удалил чек-лист, у которого уже есть заполнения. Стереть его
    // нельзя — заполнения ссылаются на его версии и хранят снимок пунктов (принцип 3, D002),
    // а лента без них показала бы историю, ведущую в никуда. Поэтому чек-лист уходит из
    // списка и перестаёт открываться на станции, а история остаётся целой. Чек-лист без
    // заполнений удаляется по-настоящему, и эта колонка ему не нужна.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: serverTimestamp(CREATED_AT),
  },
  (table) => [
    index("checklists_station_idx").on(table.stationId),
    // Равные границы делают условие выбора версии всегда ложным: чек-лист не открылся бы
    // ни на одной станции и ни в одну минуту, молча. Конец раньше начала — наоборот,
    // нормальное окно через полночь (22:00–02:00), и запрещать его нельзя.
    check("checklists_window_not_empty", sql`window_start <> window_end`),
  ],
);

export const checklistVersions = pgTable(
  "checklist_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checklistId: uuid("checklist_id")
      .notNull()
      .references(() => checklists.id, { onDelete: "restrict" }),
    // Номер есть у опубликованных и архивных версий; у черновика номера нет.
    versionNumber: integer("version_number"),
    status: text("status").$type<VersionStatus>().notNull(),
    // Станция замораживается вместе с содержимым в момент публикации, а не читается
    // из мутируемой checklists.station_id при сохранении заполнения: иначе перенос
    // чек-листа на другую станцию во время заполнения уводил бы заполнение в чужую
    // историю (принцип 3). У черновика станции нет — он ещё не опубликован;
    // у версии чек-листа, не привязанного к станции на момент публикации, тоже.
    stationId: uuid("station_id").references(() => stations.id, {
      onDelete: "set null",
    }),
    sections: jsonb("sections").$type<Section[]>().notNull().default([]),
    createdAt: serverTimestamp(CREATED_AT),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    // Требование контракта: одна опубликованная версия на чек-лист — правилом базы,
    // а не проверкой в коде, иначе гонка двух публикаций даёт две активные версии.
    uniqueIndex("checklist_versions_one_published_idx")
      .on(table.checklistId)
      .where(sql`status = 'published'`),
    uniqueIndex("checklist_versions_one_draft_idx")
      .on(table.checklistId)
      .where(sql`status = 'draft'`),
    uniqueIndex("checklist_versions_number_idx").on(
      table.checklistId,
      table.versionNumber,
    ),
    check(
      "checklist_versions_status",
      sql`status in ('draft', 'published', 'archived')`,
    ),
    check(
      "checklist_versions_draft_has_no_number",
      sql`(status = 'draft') = (version_number is null)`,
    ),
    check(
      "checklist_versions_draft_has_no_publish_time",
      sql`(status = 'draft') = (published_at is null)`,
    ),
    check(
      "checklist_versions_sections_size",
      jsonbSizeLimit("sections", SECTIONS_MAX_BYTES),
    ),
  ],
);

export const blocks = pgTable("blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: jsonb("title").$type<LocalizedText>().notNull(),
  items: jsonb("items").$type<Item[]>().notNull().default([]),
  createdAt: serverTimestamp(CREATED_AT),
  updatedAt: serverTimestamp("updated_at"),
});

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Заполнение всегда ссылается на конкретную версию — ту, что была отдана клиенту.
    versionId: uuid("version_id")
      .notNull()
      .references(() => checklistVersions.id, { onDelete: "restrict" }),
    // Станция запоминается здесь: перенос чек-листа на другую станцию не должен
    // задним числом переписывать, где заполняли (принцип 3).
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "restrict" }),
    // Снимок пунктов на момент заполнения (D002): второй способ хранения истории.
    snapshot: jsonb("snapshot").$type<Section[]>().notNull(),
    answers: jsonb("answers").$type<Answer[]>().notNull(),
    // Режим смены, в котором заполняли (D055). Хранится здесь, а не выводится задним
    // числом из `store_shift_modes`: вечерняя перестановка режима не имеет права
    // переписать, в каком режиме заполняли утром (принцип 3, D002).
    mode: text("mode").$type<ShiftMode>().notNull().default("normal"),
    // Начало — из пропуска, выданного сервером вместе с экраном (T186), отправка —
    // время сервера. Пара «версия + начало» опознаёт заполнение (индекс ниже).
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    submittedAt: serverTimestamp("submitted_at"),
    // Повтор, записанный до того, как база стала их отвергать: вторая запись того же
    // заполнения, оставшаяся от гонки одновременных отправок (миграция 0012, T219).
    // Строка остаётся в истории как есть (принцип 3), пометка лишь выводит её из-под
    // правила «одно заполнение — одна запись». Новая запись повтором не бывает: её
    // повтор отвергает сам индекс.
    duplicate: boolean("duplicate").notNull().default(false),
  },
  (table) => [
    index("submissions_submitted_at_idx").on(table.submittedAt),
    // Главный запрос ленты — «заполнения этой станции за период, свежие сверху».
    // Составной индекс покрывает и отбор по станции, и порядок внутри неё; отдельный
    // индекс по одной station_id был бы его левым префиксом, то есть лишней записью
    // на каждое сохранение — публичной точке записи это ни к чему.
    index("submissions_station_submitted_at_idx").on(
      table.stationId,
      table.submittedAt.desc(),
    ),
    index("submissions_version_idx").on(table.versionId),
    // Одно заполнение — одна запись (T219). Проверка на повтор в коде не видит запись,
    // которая ещё не зафиксирована, и две одновременные отправки обе слышали «не
    // найдено»; правило, проверяемое в самой вставке, закрывает гонку. Частичный —
    // потому что повторы, легшие до правила, в истории остаются (`duplicate`).
    uniqueIndex("submissions_one_per_filling_idx")
      .on(table.versionId, table.startedAt)
      .where(sql`not duplicate`),
    check(
      "submissions_snapshot_size",
      jsonbSizeLimit("snapshot", SECTIONS_MAX_BYTES),
    ),
    check(
      "submissions_answers_size",
      jsonbSizeLimit("answers", ANSWERS_MAX_BYTES),
    ),
    check("submissions_mode", sql`mode in ('normal', 'reduced', 'critical')`),
  ],
);

/**
 * История режимов смены пиццерии (D052, D055, D056).
 *
 * Таблица только пополняется: перестановка — новая строка. Действующий режим — самая
 * свежая строка по паре (пиццерия, местная дата); строки нет — значит полная смена.
 * Видимость каждой перестановки и есть то единственное, что удерживает от привычки
 * сокращать чек-лист каждый день: гейта на выбор режима нет сознательно (D052).
 */
export const storeShiftModes = pgTable(
  "store_shift_modes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    // Местная дата пиццерии: сутки кончаются там, где работает смена (D026).
    localDate: date("local_date").notNull(),
    mode: text("mode").$type<ShiftMode>().notNull(),
    // Причина сокращения. Необязательна: принуждение считать людей на входе вернуло бы
    // трение, ради отсутствия которого от гейта и отказались.
    staffPresent: integer("staff_present"),
    staffExpected: integer("staff_expected"),
    setAt: serverTimestamp("set_at"),
  },
  (table) => [
    index("store_shift_modes_current_idx").on(
      table.storeId,
      table.localDate,
      table.setAt.desc(),
    ),
    check(
      "store_shift_modes_mode",
      sql`mode in ('normal', 'reduced', 'critical')`,
    ),
    check(
      "store_shift_modes_staff_present",
      sql`staff_present is null or staff_present >= 0`,
    ),
    check(
      "store_shift_modes_staff_expected",
      sql`staff_expected is null or staff_expected >= 0`,
    ),
  ],
);

/**
 * Отметки периодических проверок — обходов (D066, D075).
 *
 * Таблица только пополняется: повторный обход в тот же час — новая строка, а не правка
 * прежней. Пропуска здесь нет и не будет: пропуск — это ОТСУТСТВИЕ строки против сетки
 * расписания, и выводится он при чтении (D053). Хранимый пропуск потребовал бы фоновой
 * работы, которая его проставляет, и колонки состояния, которую после каждого сбоя
 * чинят руками.
 *
 * Проход, в который встала отметка, считает сервер: `interval_start` — минуты от начала
 * окна чек-листа, та же система координат, что у `Interval.startMinutes`. С устройства
 * он не приходит и прийти не может — планшет с уехавшими часами закрывал бы девятичасовой
 * обход в одиннадцать, и девятичасовой переставал бы быть пропущенным.
 */
export const checks = pgTable(
  "checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Станция запоминается здесь так же, как в заполнениях: перенос чек-листа на другую
    // станцию не должен задним числом переписывать, где обход делали (принцип 3).
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "restrict" }),
    // Версия, на экране которой стояла отметка. Читаются отметки по чек-листу, а не по
    // версии: методист публикует следующую версию посреди смены (T041), и утренние
    // обходы не имеют права исчезнуть с экрана станции.
    versionId: uuid("version_id")
      .notNull()
      .references(() => checklistVersions.id, { onDelete: "restrict" }),
    itemId: text("item_id").notNull(),
    // Местная дата прохода ОКНА, а не дата отметки: у окна через полночь обход в час ночи
    // относится к проходу, начавшемуся вчера (D055).
    localDate: date("local_date").notNull(),
    intervalStart: integer("interval_start").notNull(),
    value: jsonb("value").$type<AnswerValue>().notNull(),
    comment: text("comment"),
    at: serverTimestamp("at"),
  },
  (table) => [
    // Главный запрос экрана станции — «отметки этой станции за сегодняшний проход».
    index("checks_station_date_idx").on(table.stationId, table.localDate),
    index("checks_version_idx").on(table.versionId),
    // Проход начинается не раньше окна: отрицательное смещение означало бы отметку до
    // открытия чек-листа, то есть ошибку счёта, а не событие смены.
    check("checks_interval_start", sql`interval_start >= 0`),
    check("checks_value_size", jsonbSizeLimit("value", CHECK_VALUE_MAX_BYTES)),
    check(
      "checks_comment_length",
      sql`comment is null or length(comment) <= ${sql.raw(String(CHECK_COMMENT_MAX_LENGTH))}`,
    ),
  ],
);

/**
 * Будильники станции — записка на сегодня (D070).
 *
 * Единственная таблица продукта, строки которой законно УДАЛЯТЬ. Правило неизменяемости
 * истории (D002) сюда не распространяется: заполнение и отметка обхода — свидетельство
 * о смене, а будильник — записка сотрудника самому себе на ближайшие часы. Её заводят,
 * её снимают, и назавтра её никто не ищет.
 *
 * Хранится строкой, а не в памяти вкладки, по одной причине: планшет на кухне гаснет и
 * перезагружается посреди смены, а будильник обязан это пережить.
 */
export const alarms = pgTable(
  "alarms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Будильник принадлежит СТАНЦИИ, а не чек-листу: на станции может быть открыто
    // несколько чек-листов (экран выбора), а планшет у неё один.
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    // Момент звонка. Считает база из часового пояса пиццерии (D026), и он же —
    // единица жизни будильника: он живёт, пока попадает в текущий проход окна
    // работы чек-листа станции (D090). Местных суток здесь нет намеренно: окно
    // ночной пиццерии переходит через полночь, и будильник вместе с ним.
    at: timestamp("at", { withTimezone: true }).notNull(),
    label: text("label").notNull(),
    createdAt: serverTimestamp(CREATED_AT),
  },
  (table) => [
    index("alarms_station_at_idx").on(table.stationId, table.at),
    // Подпись — короткая записка, а не докладная: её читают одним взглядом на 375 px.
    // Пустая запрещена: будильник без подписи звонит и не говорит, зачем.
    check(
      "alarms_label_length",
      sql`length(label) between 1 and ${sql.raw(String(ALARM_LABEL_MAX_LENGTH))}`,
    ),
  ],
);

/**
 * Счёт попыток входа в кабинет (блок `auth`, T212, T217).
 *
 * Данными продукта эти строки не являются — это состояние защиты, и живёт оно здесь
 * по одной причине: счёт обязан пережить перезапуск процесса. Пока он лежал в памяти,
 * «Повторите через 15 минут» снималось любой выкладкой и любым падением, то есть защита
 * единственного пароля продукта (D014) держалась на непрерывности процесса.
 *
 * Считаются ПОПЫТКИ, а не промахи: попытка занимает место в счёте до проверки пароля,
 * иначе одновременные запросы обходят предел все разом (T217). Удачная попытка снимает
 * строку целиком, поэтому счёт всегда означает «попытки с последнего удачного входа».
 *
 * Ключ — не адрес клиента, а sha256 от области счёта и ключа клиента: адрес приходит
 * подделываемым заголовком, и хранить его продукт не должен (D001 — людей продукт не
 * опознаёт вовсе). Форма отпечатка проверяется в самой базе (миграция 0010).
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    attemptKey: text("attempt_key").primaryKey(),
    // Начало окна: отсчёт от первой попытки, поэтому отказ кончается в названный срок,
    // и залп попыток отказ не продлевает.
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    attempts: integer("attempts").notNull(),
  },
  () => [
    // Оба ограничения стоят в базе с миграции 0010 (имена — от 0011, после переименования
    // счёта промахов в счёт попыток). Объявлены они здесь потому, что схема — источник
    // генерации миграций: пока их тут не было, сгенерированная миграция создавала таблицу
    // без них и снимала последний рубеж молча (T221).
    //
    // Форма ключа: ровно шестьдесят четыре шестнадцатеричных знака, то есть sha256 и
    // ничего кроме. Забытое хэширование в коде не должно означать, что база примет
    // подделываемый заголовком адрес клиента как есть.
    check(
      "login_attempts_attempt_key_shape",
      sql`attempt_key ~ '^[0-9a-f]{64}$'`,
    ),
    // Строка заводится первой попыткой и снимается удачным входом, поэтому ноль или
    // отрицательное значение здесь означает не «никто не пробовал», а сбой счёта.
    check("login_attempts_attempts_positive", sql`attempts > 0`),
  ],
);

export type Country = typeof countries.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type Station = typeof stations.$inferSelect;
export type Checklist = typeof checklists.$inferSelect;
export type ChecklistVersion = typeof checklistVersions.$inferSelect;
export type Block = typeof blocks.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type StoreShiftMode = typeof storeShiftModes.$inferSelect;
export type Check = typeof checks.$inferSelect;
export type Alarm = typeof alarms.$inferSelect;
