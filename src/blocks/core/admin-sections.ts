// Разделы кабинета: адрес и готовность — один факт на весь продукт.
//
// До этого модуля каждая боковая навигация (editor, feed, qr, catalog) держала свой список
// адресов и сама решала, какой раздел «ещё не готов». Списки разъехались молча: «Заполнения» и
// «QR-коды» месяц показывались надписью «Раздел ещё не готов», хотя работали, а из справочника
// нельзя было уйти вообще никуда — продукт существовал как набор адресов, а не как целое (#11).
// Границы блоков (`.dependency-cruiser.cjs`) не дают навигации редактора импортировать блок
// заполнений, поэтому общее знание живёт здесь, в `core`, доступном каждому блоку.
//
// Готовность раздела меняется РОВНО здесь. Экран, доводящий раздел до готовности, правит эту
// строку — и все навигации узнают об этом одновременно. Связность проверяет `e2e/admin-nav.spec.ts`.

/** Раздел кабинета: куда ведёт и можно ли туда пускать. */
export interface AdminSection {
  readonly path: string;
  /** `false` — раздела в продукте ещё нет: навигация показывает его неактивным, без ссылки. */
  readonly ready: boolean;
}

export const ADMIN_SECTIONS = {
  checklists: { path: "/admin/checklists", ready: true },
  library: { path: "/admin/library", ready: true },
  feed: { path: "/admin/feed", ready: true },
  catalog: { path: "/admin/catalog", ready: true },
  qr: { path: "/admin/qr", ready: true },
  devices: { path: "/admin/devices", ready: true },
} as const satisfies Record<string, AdminSection>;

/**
 * Главная кабинета. Разделом она не является — в меню её пункта нет и подсвечивать там
 * нечего, — но адрес у неё того же порядка: его знает бренд в меню, входная страница
 * продукта и, отдельной копией, блок входа (`auth/routes.ts`, куда попадает вошедший).
 *
 * Лежит здесь, а не строкой по месту: адреса разделов в этом проекте вычищали трижды
 * (T116, T118, T119) — каждый раз блок держал собственную копию того, что уже лежало тут.
 * Признака готовности у главной нет: она есть всегда, иначе кабинета нет вовсе.
 */
export const ADMIN_HOME: Pick<AdminSection, "path"> = { path: "/admin" };

export type AdminSectionKey = keyof typeof ADMIN_SECTIONS;

/** Группа пунктов бокового меню: её заголовок и разделы по порядку. */
export interface AdminNavGroup {
  readonly key: string;
  readonly items: readonly AdminSectionKey[];
}

/**
 * Порядок и группировка пунктов бокового меню по эталону
 * (`docs/furca/design/screens/*.html`): «Работа» и «Справочник».
 *
 * Лежит рядом с адресами, а не внутри компонента меню: порядок — такой же общий факт,
 * как готовность раздела. Пока меню было четырьмя копиями, разъехались не только списки,
 * но и подписи одного и того же пункта («Чек-листы» шли под ключом `templates` в двух
 * копиях и под `checklists` в двух других) — T074.
 */
export const ADMIN_NAV_GROUPS = [
  { key: "work", items: ["checklists", "library", "feed"] },
  { key: "reference", items: ["catalog", "qr", "devices"] },
] as const satisfies readonly AdminNavGroup[];
