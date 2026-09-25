// Границы модулей выведены из графа блоков в docs/furca/plan.md.
// Блок импортирует только то, от чего зависит по графу; обратное направление запрещено.
const DEPS = {
  core: [],
  data: ["core"],
  // data — счёт неудачных попыток входа: он обязан пережить перезапуск процесса,
  // а состояние продукта живёт только в базе (T212). Обратного направления нет:
  // слой данных о входе по-прежнему не знает.
  auth: ["data", "core"],
  catalog: ["data", "auth", "core"],
  editor: ["data", "auth", "core"],
  library: ["editor", "data", "auth", "core"],
  // auth — по графу из plan.md: экран печати и перевыпуск кода закрыты входом.
  qr: ["catalog", "data", "auth", "core"],
  fill: ["data", "editor", "core"],
  feed: ["data", "auth", "core"],
  // device рисует экран заполнения (fill), держит строки привязки (data), заводит пин с
  // экрана кабинета (auth) и зовёт общую подпись (core). Обратного направления нет:
  // ни fill, ни auth о привязке планшета не знают.
  device: ["fill", "data", "auth", "core"],
  // stations — раздел, который собирает, а не строит: станции берёт у catalog, наклейку
  // у qr, привязку планшета у device. Обратного направления нет и быть не может — на
  // stations не ссылается никто, поэтому сборка не тянет за собой цикл. Отдельным
  // блоком, а не внутри catalog: справочник отвечает «какие станции у этой пиццерии»,
  // а раздел — «где по сети дырки», и второе знает про планшеты и наклейки, до которых
  // справочнику дела нет.
  stations: ["qr", "catalog", "device", "data", "auth", "core"],
  demo: ["catalog", "editor", "fill", "feed", "data", "core"],
};

const blockRules = Object.entries(DEPS).map(([block, allowed]) => ({
  name: `boundary-${block}`,
  comment: `Блок ${block} может импортировать только: ${allowed.join(", ") || "(ничего)"}`,
  severity: "error",
  from: { path: `^src/blocks/${block}/` },
  to: {
    path: "^src/blocks/([^/]+)/",
    pathNot: [`^src/blocks/(${[block, ...allowed].join("|")})/`],
  },
}));

module.exports = {
  forbidden: [
    ...blockRules,
    {
      name: "public-route-has-no-auth",
      comment:
        "Публичный маршрут заполнения не имеет права зависеть от входа в админку",
      severity: "error",
      from: { path: "^src/app/s/" },
      to: { path: "^src/blocks/auth/" },
    },
    {
      name: "tablet-route-has-no-auth",
      comment:
        "Страница привязки и привязанная вкладка — публичная сторона: отказ кабинета не " +
        "имеет права увести человека с кухни на пароль, которого у него нет (T187)",
      severity: "error",
      from: { path: "^src/app/(pair|station)/" },
      to: { path: "^src/blocks/auth/" },
    },
    {
      name: "db-only-through-data",
      comment:
        "В базу ходит только блок data — остальные через его слой доступа",
      severity: "error",
      from: { pathNot: "^src/blocks/data/" },
      to: { path: "node_modules/(pg|postgres|drizzle-orm/node-postgres)" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
