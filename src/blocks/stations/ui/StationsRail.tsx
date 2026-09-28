"use client";

// Колонка станций слева от карточки (D163: «в станциях меридиуса тоже самое»):
// фишки «Все / Без чек-листа / Молчат» и станции сети, сгруппированные страна →
// пиццерия. Живёт в разметке сегмента `/admin/stations`, поэтому выбор другой станции
// её не перерисовывает — остаются прокрутка и отмеченные галочки раскатки.
//
// Строка — обычный текст цвета `--ink`, нажимается вся, кроме галочки; наведение —
// `--surface-2`, выбранная — `--accent-soft` с полосой слева, как в колонке чек-листов
// и в левой панели (D162, D164).
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  usePathname,
  useSearchParams,
  useSelectedLayoutSegment,
} from "next/navigation";
import type { ReactElement } from "react";

import { useStickyQuery } from "@/blocks/core/ui/use-sticky-query";

import type { StationGap } from "../gaps";
import {
  asGapFilter,
  GAP_FILTERS,
  GAP_PARAM,
  ROLLOUT_FORM_ID,
  stationHref,
  type GapFilter,
} from "./view";

/** Станция в колонке — ровно то, что строка показывает. */
export interface StationRailRow {
  readonly id: string;
  readonly name: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly countryId: string;
  readonly countryName: string;
  readonly checklistCount: number;
  readonly deviceCount: number;
  readonly gaps: readonly StationGap[];
}

const KEYS: readonly string[] = [GAP_PARAM];

const HEAD_CLASS =
  "bg-surface sticky top-0 z-[1] flex flex-col gap-[var(--space-5)] border-b border-[var(--line)] px-[var(--space-6)] pt-[var(--space-7)] pb-[var(--space-6)]";
const TITLE_CLASS =
  "text-[length:var(--fs-title)] leading-[var(--lh-title)] font-semibold text-ink";
const COUNT_CLASS =
  "font-[family-name:var(--font-num)] text-[length:var(--fs-meta)] text-[var(--ink-3)] [font-variant-numeric:tabular-nums]";
const CHIP_CLASS =
  "flex h-[var(--control-h-sm)] items-center rounded-[var(--r-pill)] border px-[var(--space-5)] text-[length:var(--fs-dense)] no-underline hover:no-underline";
const CHIP_IDLE_CLASS =
  "bg-surface border-[var(--line-control)] text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-ink";
const CHIP_ACTIVE_CLASS =
  "border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent)] hover:text-[var(--accent)]";
const LIST_CLASS =
  "flex flex-col gap-[var(--space-1)] px-[var(--space-4)] py-[var(--space-4)]";
const COUNTRY_CLASS =
  "px-[var(--space-5)] pt-[var(--space-6)] pb-[var(--space-1)] text-[length:var(--fs-micro)] leading-[var(--lh-micro)] font-semibold tracking-[var(--tracking-micro)] text-[var(--ink-3)] uppercase";
const STORE_CLASS =
  "px-[var(--space-5)] pt-[var(--space-3)] pb-[var(--space-1)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] font-medium text-[var(--ink-2)]";
const ROW_BASE_CLASS =
  "flex items-start gap-[var(--space-4)] rounded-[var(--r-control)] px-[var(--space-5)] py-[var(--space-4)] transition-[background] duration-[var(--t-state)]";
const ROW_IDLE_CLASS = `${ROW_BASE_CLASS} hover:bg-[var(--surface-2)]`;
const ROW_CURRENT_CLASS = `${ROW_BASE_CLASS} bg-[var(--accent-soft)] shadow-[inset_2px_0_0_var(--accent)]`;
const LINK_CLASS =
  "flex min-w-0 flex-1 flex-col gap-[var(--space-1)] rounded-[var(--r-mark)] text-ink no-underline hover:text-ink hover:no-underline focus-visible:shadow-[0_0_0_2px_var(--accent)] focus-visible:outline-none";
const NAME_CLASS =
  "text-[length:var(--fs-body)] leading-[var(--lh-body)] font-medium [overflow-wrap:anywhere]";
const META_CLASS =
  "flex flex-wrap items-center gap-x-[var(--space-3)] gap-y-[var(--space-1)] text-[length:var(--fs-meta)] leading-[var(--lh-meta)] text-[var(--ink-3)]";
const GAP_CLASS =
  "text-err rounded-[var(--r-mark)] bg-[var(--err-soft)] px-[var(--space-3)] text-[length:var(--fs-meta)] font-medium";
const EMPTY_CLASS =
  "px-[var(--space-5)] py-[var(--space-8)] text-[length:var(--fs-dense)] leading-[var(--lh-dense)] text-[var(--ink-2)]";

type Translate = ReturnType<typeof useTranslations<"stations">>;

interface StoreGroup {
  readonly key: string;
  readonly countryName: string | null;
  readonly storeName: string;
  readonly stations: StationRailRow[];
}

/**
 * Группы одним проходом по уже отсортированному списку, а не сортировкой: порядок
 * задаёт база (`listNetworkStations`), второй источник правды о нём разъехался бы с
 * печатью наклеек. Название страны несёт только первая группа страны.
 */
function groupByStore(rows: readonly StationRailRow[]): readonly StoreGroup[] {
  const groups: StoreGroup[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last?.key === row.storeId) {
      last.stations.push(row);
      continue;
    }
    const sameCountry = groups.some((group) =>
      group.stations.some((one) => one.countryId === row.countryId),
    );
    groups.push({
      key: row.storeId,
      countryName: sameCountry ? null : row.countryName,
      storeName: row.storeName,
      stations: [row],
    });
  }
  return groups;
}

function StationRow({
  station,
  href,
  isCurrent,
  canPick,
  t,
}: {
  readonly station: StationRailRow;
  readonly href: string;
  readonly isCurrent: boolean;
  readonly canPick: boolean;
  readonly t: Translate;
}): ReactElement {
  return (
    <div
      className={isCurrent ? ROW_CURRENT_CLASS : ROW_IDLE_CLASS}
      data-testid="station-row"
    >
      {/*
        Галочка — поле формы раскатки, которая стоит справа, на экране раздела
        (атрибут `form`). Своего состояния у неё нет намеренно: выбор живёт в DOM
        колонки и переживает смену фильтра, потому что колонка не перерисовывается.
        Пока открыта карточка станции, формы раскатки на экране нет — и галочек тоже:
        отмечать было бы некуда.
      */}
      {canPick ? (
        <input
          type="checkbox"
          name="stationIds"
          value={station.id}
          form={ROLLOUT_FORM_ID}
          aria-label={station.name}
          data-testid="station-pick"
          className="mt-[var(--space-1)] size-[16px] flex-none accent-[var(--accent)]"
        />
      ) : null}
      <Link
        href={href}
        className={LINK_CLASS}
        data-testid="station-link"
        {...(isCurrent ? { "aria-current": "page" as const } : {})}
      >
        <span className={NAME_CLASS}>{station.name}</span>
        <span className={META_CLASS}>
          {station.checklistCount === 0 ? (
            <span className={GAP_CLASS} data-testid="gap-noChecklist">
              {t("gaps.noChecklist")}
            </span>
          ) : (
            <span>{t("checklists", { count: station.checklistCount })}</span>
          )}
          {station.gaps.includes("silent") ? (
            <span className={GAP_CLASS} data-testid="gap-silent">
              {t("gaps.silent")}
            </span>
          ) : null}
          <span>
            {station.deviceCount > 0 ? t("tabletPaired") : t("stickerOnly")}
          </span>
        </span>
      </Link>
    </div>
  );
}

function GapChips({
  active,
  counts,
  total,
  t,
}: {
  readonly active: GapFilter | undefined;
  readonly counts: Readonly<Record<GapFilter, number>>;
  readonly total: number;
  readonly t: Translate;
}): ReactElement {
  const pathname = usePathname();
  const params = useSearchParams();

  // Фишка — ссылка на тот же адрес с другим фильтром: работает без JavaScript, а
  // остальные параметры (выбранный для раскатки шаблон) не теряются. «Все» пишет
  // пустое значение, а не убирает параметр: адрес без фильтра колонка читает как
  // «ничего не сказано» и сужения не снимает (`useStickyQuery`).
  function hrefFor(gap: string): string {
    const next = new URLSearchParams(params);
    next.set(GAP_PARAM, gap);
    return `${pathname}?${next.toString()}`;
  }

  const chips: [string, GapFilter | undefined, string][] = [
    ["all", undefined, t("filters.all", { count: total })],
    ...GAP_FILTERS.map((name): [string, GapFilter, string] => [
      name,
      name,
      t(`filters.${name}`, { count: counts[name] }),
    ]),
  ];

  return (
    <div
      className="flex flex-wrap gap-[var(--space-3)]"
      data-testid="station-filters"
    >
      {chips.map(([key, gap, label]) => (
        <Link
          key={key}
          href={hrefFor(gap ?? "")}
          scroll={false}
          data-testid={`filter-${key}`}
          aria-current={active === gap ? "page" : undefined}
          className={`${CHIP_CLASS} ${active === gap ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

export function StationsRail({
  rows,
  counts,
}: {
  readonly rows: readonly StationRailRow[];
  /** Счёт дырок по всей сети — тот же `countGaps`, что у главной кабинета. */
  readonly counts: Readonly<Record<StationGap, number>>;
}): ReactElement {
  const t = useTranslations("stations");
  const current = useSelectedLayoutSegment();
  const { values, suffix } = useStickyQuery(KEYS);

  const active = asGapFilter(values[GAP_PARAM]);
  const shown =
    active === undefined
      ? rows
      : rows.filter((station) => station.gaps.includes(active));

  return (
    <div className="flex min-h-0 flex-col" data-testid="stations-rail">
      <div className={HEAD_CLASS}>
        <div className="flex items-center gap-[var(--space-4)]">
          <h2 className={TITLE_CLASS}>{t("title")}</h2>
          <span className={COUNT_CLASS}>{String(rows.length)}</span>
        </div>
        <GapChips active={active} counts={counts} total={rows.length} t={t} />
      </div>

      <div className={LIST_CLASS}>
        {shown.length === 0 ? (
          <p className={EMPTY_CLASS} data-testid="stations-empty">
            {active === undefined ? t("empty") : t("emptyFiltered")}
          </p>
        ) : (
          groupByStore(shown).map((group) => (
            <div key={group.key} className="flex flex-col gap-[var(--space-1)]">
              {group.countryName === null ? null : (
                <div className={COUNTRY_CLASS}>{group.countryName}</div>
              )}
              <div className={STORE_CLASS}>{group.storeName}</div>
              {group.stations.map((station) => (
                <StationRow
                  key={station.id}
                  station={station}
                  href={`${stationHref(station.id)}${suffix}`}
                  isCurrent={station.id === current}
                  canPick={current === null}
                  t={t}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
