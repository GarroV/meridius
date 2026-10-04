import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { CountryStatsModel, StoreTile } from "../country-model";

/**
 * Плитки пиццерий страны (D179): «партнёр должен видеть плитки пиццерий». Плитка — карточка
 * ядра `.card` (D164) целиком ссылкой в пиццерию: имя, статус её чек-листов на сегодня
 * метками `.tag` и пара цифр за период. Цвет метки несёт смысл: зелёный — заполнено,
 * красный — пропущено, жёлтый — тревоги; ноль метки не получает, а не красится зря.
 */

const GRID_CLASS =
  "m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-[var(--space-6)] p-0";
const TILE_CLASS =
  "card flex h-full flex-col text-ink no-underline transition-[border-color] duration-[var(--t-state)] hover:border-[var(--line-control-2)] hover:text-ink hover:no-underline focus-visible:shadow-[0_0_0_2px_var(--accent)] focus-visible:outline-none";
const TAGS_CLASS =
  "flex flex-wrap gap-[var(--space-3)] px-[var(--space-7)] pt-[var(--space-6)]";
const FIGURES_CLASS =
  "card__meta px-[var(--space-7)] pt-[var(--space-5)] pb-[var(--space-7)]";
const H2_CLASS =
  "m-0 text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold";
const META_CLASS = "m-0 text-[length:var(--fs-meta)] text-[var(--ink-3)]";
const TODAY_CLASS =
  "self-center text-[length:var(--fs-meta)] font-medium text-[var(--ink-3)]";

type Translate = Awaited<ReturnType<typeof getTranslations>>;

function TodayTags({
  tile,
  t,
}: {
  readonly tile: StoreTile;
  readonly t: Translate;
}): ReactElement {
  const { today } = tile;
  if (today.total === 0) {
    return <span className="tag tag--neutral">{t("noChecklists")}</span>;
  }
  return (
    <>
      {today.filled > 0 ? (
        <span className="tag tag--ok" data-testid="tile-filled">
          {t("filled", { count: today.filled })}
        </span>
      ) : null}
      {today.waiting > 0 ? (
        <span className="tag tag--neutral" data-testid="tile-waiting">
          {t("waiting", { count: today.waiting })}
        </span>
      ) : null}
      {today.missed > 0 ? (
        <span className="tag tag--err" data-testid="tile-missed">
          {t("missed", { count: today.missed })}
        </span>
      ) : null}
      {tile.alarmCount > 0 ? (
        <span className="tag tag--warn" data-testid="tile-alarms">
          {t("alarms", { count: tile.alarmCount })}
        </span>
      ) : null}
    </>
  );
}

export async function StoreTiles({
  model,
}: {
  readonly model: CountryStatsModel;
}): Promise<ReactElement> {
  const t = await getTranslations("feed.country");

  return (
    <section
      className="flex flex-col gap-[var(--space-6)]"
      aria-labelledby="store-tiles-title"
      data-testid="store-tiles"
    >
      <div className="flex flex-col gap-[var(--space-2)]">
        <h2 id="store-tiles-title" className={H2_CLASS}>
          {t("tilesTitle")}
        </h2>
        <p className={META_CLASS}>{t("tilesLead")}</p>
      </div>
      {model.stores.length === 0 ? (
        <p className={META_CLASS} data-testid="store-tiles-empty">
          {t("noStores")}
        </p>
      ) : (
        <ul className={GRID_CLASS}>
          {model.stores.map((tile) => (
            <li key={tile.storeId}>
              <Link
                href={tile.href}
                className={TILE_CLASS}
                data-testid="store-tile"
              >
                <div className="card__head">
                  <span className="card__title">{tile.name}</span>
                </div>
                <div className={TAGS_CLASS}>
                  {/* Свой горизонт у плитки — «сегодня», а не период экрана: так и
                      подписано (interface-logic п.3). */}
                  <span className={TODAY_CLASS}>{t("todayLabel")}</span>
                  <TodayTags tile={tile} t={t} />
                </div>
                <p className={`m-0 ${FIGURES_CLASS}`}>
                  {t("periodFigures", {
                    submissions: tile.submissionCount,
                    failed: tile.criticalFailedCount,
                  })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {model.unknownTimezoneStores > 0 ? (
        <p className={META_CLASS} data-testid="store-tiles-timezone">
          {t("unknownTimezone", { count: model.unknownTimezoneStores })}
        </p>
      ) : null}
      {model.capped ? <p className={META_CLASS}>{t("capped")}</p> : null}
    </section>
  );
}
