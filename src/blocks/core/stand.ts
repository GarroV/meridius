// Метка стенда в самой базе: доказательство «этот сервер мой, а не соседней копии» (T101).
//
// Откуда взялась задача. Порт базы на хосте один и тот же у всех копий репозитория
// (`${DB_PORT:-5433}` в `docker-compose.yml`, `DATABASE_URL` на 5433 в `.env.example`,
// который копируют в `.env` все копии сразу). Различает копии только имя проекта
// compose — а оно порт не разводит. Дальше происходит вот что: первая копия занимает
// 5433, `docker compose up -d` второй копии на этот порт встать не может, и вторая копия
// продолжает работать по своему `DATABASE_URL` — то есть по чужому серверу. Молча:
// подключение отвечает, миграции накатываются, сид пишет данные, прогон зеленеет. Чужой
// стенд от своего не отличим ничем, кроме содержимого.
//
// Имена тестовой базы и базы сквозных сценариев метку копии уже несут (T070), поэтому
// схему друг у друга копии не сносят. Осталось ровно то, что метка в имени не ловит:
// РАБОЧАЯ база называется одинаково у всех, и уехать в неё чужими миграциями и сидом
// можно в один шаг.
//
// Почему метка, а не разведение портов. Порт по копии считать можно, но он не защищает:
// адрес базы задаётся руками в `.env`, и любой скопированный `DATABASE_URL` возвращает
// проблему целиком. Метка отвечает на сам вопрос — «чья это база» — и отвечает одинаково
// при любом способе туда попасть.
//
// Метка живёт в служебной базе `postgres` того же сервера, по строке на базу. Сначала
// она была одна на весь сервер, но с 25.09.2026 сервер разработки один на все копии
// (туннель на MUSPELHEIM), и такая метка отказывала любой второй копии — параллельная
// волна блоков не могла прогнать ни одного теста. Делить сервер можно, делить базу —
// нет: каждой копии своя рабочая база в `DATABASE_URL`, и метка сторожит именно её.
// Прежняя таблица `stand.marker` больше не читается.
// Хранится в отдельной схеме `stand` — среди таблиц продукта ей не место, и `drop schema
// public cascade` из подготовки прогона её не задевает. Снимается вместе с томом:
// `docker compose down -v` возвращает стенд в состояние «ничей», и следующий подъём
// метит его заново.
import { repositoryCopyId, repositoryRoot } from "./repo-copy";

/** Минимум от подключения к базе, который нужен метке. Так же выглядит `Pool` из `pg`. */
export interface StandStore {
  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ readonly rows: readonly unknown[] }>;
}

/** Копия репозитория: устойчивая метка и путь, по которому её узнаёт человек. */
export interface StandOwner {
  readonly copyId: string;
  readonly root: string;
}

export type StandCheck =
  /** Стенд свой. `claimed` — метку поставили только что, стенд был ничей. */
  | { readonly kind: "own"; readonly claimed: boolean }
  /** Стенд принадлежит другой копии репозитория. */
  | {
      readonly kind: "foreign";
      readonly copyId: string;
      readonly root: string;
    };

const CREATE_SCHEMA = "create schema if not exists stand";

const CREATE_TABLE = `create table if not exists stand.claim (
  database text primary key,
  copy_id text not null,
  root text not null,
  claimed_at timestamptz not null default now()
)`;

// `returning` отвечает на вопрос «метку поставили мы или она уже была»: строка приходит
// только тому, чья вставка прошла. При гонке двух подъёмов её получает ровно один.
const CLAIM =
  "insert into stand.claim (database, copy_id, root) values ($1, $2, $3) on conflict do nothing returning copy_id";

const READ = "select copy_id, root from stand.claim where database = $1";

function asMarker(row: unknown): StandOwner | undefined {
  if (typeof row !== "object" || row === null) return undefined;
  const { copy_id: copyId, root } = row as Record<string, unknown>;
  if (typeof copyId !== "string" || typeof root !== "string") return undefined;
  return { copyId, root };
}

/** Эта копия репозитория: метка считается от пути самой копии, настраивать нечего. */
export function ownStand(): StandOwner {
  return { copyId: repositoryCopyId(), root: repositoryRoot() };
}

/**
 * Метит базу своей и говорит, чья она на самом деле.
 *
 * Ничего не сносит и ничего не переписывает: чужая метка остаётся чужой, решение
 * принимает тот, кто позвал. Ничейный стенд становится своим — поэтому уже поднятый
 * стенд метится сам, без единой команды руками.
 */
export async function claimStand(
  store: StandStore,
  database: string,
  own: StandOwner = ownStand(),
): Promise<StandCheck> {
  await store.query(CREATE_SCHEMA);
  await store.query(CREATE_TABLE);
  const claim = await store.query(CLAIM, [database, own.copyId, own.root]);
  const claimed = claim.rows.length === 1;

  const { rows } = await store.query(READ, [database]);
  const marker = asMarker(rows[0]);

  // Метки нет там, где её только что поставили, — значит, кто-то её снял между двумя
  // запросами. Считать такой стенд своим нельзя: это ровно то состояние гонки, ради
  // которого проверка и заведена.
  if (marker === undefined) {
    return { kind: "foreign", copyId: "—", root: "неизвестна" };
  }

  if (marker.copyId === own.copyId) {
    return { kind: "own", claimed };
  }

  return { kind: "foreign", copyId: marker.copyId, root: marker.root };
}

/** Отказ словами: чья база, куда подключились и что с этим делать. */
export function foreignStandMessage(
  check: Extract<StandCheck, { kind: "foreign" }>,
  context: {
    readonly target: string;
    readonly database: string;
    readonly own: StandOwner;
  },
): string {
  return [
    `База ${context.database} на ${context.target} принадлежит другой копии репозитория.`,
    `  чужая копия: ${check.root} (метка ${check.copyId})`,
    `  эта копия:   ${context.own.root} (метка ${context.own.copyId})`,
    "",
    "Это не сбой подключения, а защита: миграции и сид этой копии ушли бы в чужую базу,",
    "и заметить это было бы нечем — чужая база отвечает так же, как своя.",
    "",
    "Что делать: задайте этой копии свою базу в DATABASE_URL (например meridius_<блок>);",
    "сервер делить можно, базу — нет.",
    "",
    "Если базу делите осознанно, снимите метку и повторите:",
    `  psql <адрес сервера>/postgres -c "delete from stand.claim where database = '${context.database}'"`,
  ].join("\n");
}
