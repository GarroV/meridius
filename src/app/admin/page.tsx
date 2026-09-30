import { getLocale, getTranslations } from "next-intl/server";

import { requireAdmin } from "@/blocks/auth/guard";
import { scopeOf, visibleCountryIds } from "@/blocks/auth/scope";
import { submitSignOut } from "@/blocks/auth/ui/sign-out-action";
import { ADMIN_SECTIONS } from "@/blocks/core/admin-sections";
import { AdminHome } from "@/blocks/core/ui/AdminHome";
import { AdminShell } from "@/blocks/core/ui/AdminShell";
import { listSubmissions } from "@/blocks/data";
import { NO_FILTER } from "@/blocks/editor/filter";
import { listChecklists } from "@/blocks/editor/listing";
import { checklistPath } from "@/blocks/editor/routes";
import { submissionPath } from "@/blocks/feed/routes";
import { pickText } from "@/blocks/feed/text";
import { countGaps, listNetworkStations } from "@/blocks/stations/overview";
import { GAP_PARAM, STATIONS_PATH } from "@/blocks/stations/ui/view";

// Первый экран после входа (D148): работа вошедшего, а не указатель разделов. До T315
// здесь стояли карточки разделов со строкой «выберите раздел» — продукт встречал
// человека словами «иди поищи», не сказав ни что у него есть, ни что от него ждут.
//
// «Моё» — ровно то, что вошедший видит в разделах (D145): чек-листы — список раздела
// «Чек-листы» (шаблоны туда не входят, D149), станции — дерево раздела «Станции»,
// заполнения — лента. Экран спрашивает те же функции, что и разделы, а не пишет свои
// запросы: главная, насчитавшая другое число дырок, чем раздел, куда она ведёт, —
// первая причина перестать верить обоим.
//
// Сборка — здесь, а не в `core`: границы модулей не пускают `core` ни в базу, ни в
// чужие блоки. Разметку рисует `core/ui/AdminHome`, получая готовые строки.

/** Сколько чек-листов показать строками; остальные — ссылкой в раздел. */
const CHECKLISTS_SHOWN = 8;
/** Сколько последних заполнений показать. */
const SUBMISSIONS_SHOWN = 5;

const SIGN_OUT_CLASS =
  "bg-surface text-ink flex h-[var(--control-h)] items-center justify-center rounded-[var(--r-control)] border border-[var(--line-control)] px-[var(--space-6)] text-[length:var(--fs-body)] font-medium hover:border-[var(--line-control-2)]";

function joinPlace(parts: readonly (string | null)[]): string | null {
  const present = parts.filter((part): part is string => part !== null);
  return present.length === 0 ? null : present.join(" · ");
}

export default async function AdminHomePage() {
  const viewer = await requireAdmin();
  const scope = scopeOf(viewer);
  const locale = await getLocale();
  const t = await getTranslations("admin");
  const now = new Date();

  const countryIds = visibleCountryIds(scope);
  const [checklists, stations, submissions] = await Promise.all([
    listChecklists(NO_FILTER, viewer),
    listNetworkStations(scope, now),
    listSubmissions({
      ...(countryIds === null ? {} : { countryIds }),
      limit: SUBMISSIONS_SHOWN,
    }),
  ]);

  return (
    <AdminShell
      active="home"
      testId="admin-home-screen"
      // Раздел не выбран намеренно: главная — единственный экран кабинета, который
      // не является разделом, и подсвечивать в меню ей нечего.
      breadcrumb={t("crumbs")}
      title={t("home")}
      topbarAction={
        <form action={submitSignOut}>
          <button
            type="submit"
            data-testid="sign-out"
            className={SIGN_OUT_CLASS}
          >
            {t("signOut")}
          </button>
        </form>
      }
    >
      <AdminHome
        checklists={checklists.slice(0, CHECKLISTS_SHOWN).map((row) => ({
          id: row.id,
          href: checklistPath(row.id),
          title: pickText(row.title, locale),
          place: joinPlace([row.countryName, row.storeName, row.stationName]),
          publishedNumber: row.publishedNumber,
          hasUnpublishedChanges: row.hasUnpublishedChanges,
        }))}
        checklistTotal={checklists.length}
        stationsWithoutChecklist={countGaps(stations).noChecklist}
        submissions={submissions.map((row) => ({
          id: row.id,
          href: submissionPath(row.id),
          title: pickText(row.checklistTitle, locale),
          place: [row.storeName, row.stationName].join(" · "),
          submittedAt: row.submittedAt,
        }))}
        now={now}
        links={{
          checklists: ADMIN_SECTIONS.checklists.path,
          stationsWithoutChecklist: `${STATIONS_PATH}?${GAP_PARAM}=noChecklist`,
          feed: ADMIN_SECTIONS.feed.path,
          templates: ADMIN_SECTIONS.templates.path,
        }}
      />
    </AdminShell>
  );
}
