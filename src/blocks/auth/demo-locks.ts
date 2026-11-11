/**
 * Открытое демо: что закрыто, а что работает (D194). Ядро — закрытое на бумаге и
 * открытое на деле неотличимо от закрытого, пока кто-то не нажмёт.
 *
 * Учётки ролей демо общие на всех посетителей, а посетитель анонимен. Поэтому закрыто
 * всё, что меняет доступ или выходит наружу: управление учётками и тенантами, смена и
 * сброс паролей, привязка почты и вход через Google. Остальное — чек-листы, станции,
 * QR, заполнение, привязка планшета — открыто: данные демо сбрасываются раз в час
 * (`deploy/demo/reset.sh`), и показывать продукт в деле важнее, чем беречь выдуманное.
 *
 * Два явных списка на ВСЕ серверные действия и обработчики маршрутов. Что новое
 * действие не проскочило в демо незамеченным, держит `demo-locks.test.ts`: он читает
 * исходники и краснеет на любом, не названном здесь, и на любом закрытом без проверки.
 * Ключ — `путь от src/#имя`: имена повторяются между блоками (`submitAssignChecklist`).
 *
 * Закрытое действие ПЕРВЫМ делом после проверки входа спрашивает `demoLocked()` и
 * отвечает отказом с понятным текстом, а не пятисоткой: форма показывает его как
 * обычную ошибку (`demo.locked`).
 */
import { getTranslations } from "next-intl/server";

import { isDemoMode } from "./config";

/** Работает в демо. */
export const DEMO_OPEN_ACTIONS: readonly string[] = [
  // Вход и выход: сам вход в демо — `/demo/<роль>`, пароль остаётся запасным входом.
  "app/(public)/demo/[role]/route.ts#POST",
  "blocks/auth/actions.ts#signIn",
  "blocks/auth/actions.ts#signOut",
  "blocks/auth/ui/login-action.ts#submitLogin",
  "blocks/auth/ui/sign-out-action.ts#submitSignOut",
  "blocks/core/ui/locale-action.ts#chooseLocale",

  // Чтение: отдают картинку или код станции, ничего не меняют.
  "app/healthz/route.ts#GET",
  "app/admin/qr/code/route.ts#GET",
  "app/admin/qr/sticker/route.ts#GET",

  // Справочник: страны, пиццерии, станции.
  "blocks/catalog/ui/actions.ts#submitCreateCountry",
  "blocks/catalog/ui/actions.ts#submitUpdateCountry",
  "blocks/catalog/ui/actions.ts#submitDeleteCountry",
  "blocks/catalog/ui/actions.ts#submitCreateStore",
  "blocks/catalog/ui/actions.ts#submitUpdateStore",
  "blocks/catalog/ui/actions.ts#submitDeleteStore",
  "blocks/catalog/ui/actions.ts#submitCreateStation",
  "blocks/catalog/ui/actions.ts#submitUpdateStation",
  "blocks/catalog/ui/actions.ts#submitDeleteStation",
  "blocks/catalog/ui/actions.ts#submitReissueCode",
  "blocks/catalog/ui/actions.ts#submitAssignChecklist",
  "blocks/catalog/ui/actions.ts#submitDetachChecklist",

  // Редактор чек-листов и библиотека блоков.
  "blocks/editor/actions.ts#submitCreateChecklist",
  "blocks/editor/actions.ts#submitTakeTemplate",
  "blocks/editor/actions.ts#submitSaveDraft",
  "blocks/editor/actions.ts#submitPublish",
  "blocks/editor/actions.ts#submitDeleteChecklist",
  "blocks/editor/actions.ts#submitDuplicate",
  "blocks/editor/actions.ts#submitMakeTemplate",
  "blocks/editor/actions.ts#submitDismissTemplateUpdate",
  "blocks/editor/actions.ts#submitTakeTemplateChanges",
  "blocks/library/actions.ts#submitCreateBlock",
  "blocks/library/actions.ts#submitSaveBlock",

  // Станции, QR и привязка планшета.
  "blocks/stations/ui/actions.ts#submitAssignChecklist",
  "blocks/stations/ui/actions.ts#submitDetachChecklist",
  "blocks/stations/ui/actions.ts#submitReissueCode",
  "blocks/stations/ui/actions.ts#submitCopyToStations",
  "blocks/device/ui/issue-pin-action.ts#issuePinAction",
  "blocks/device/ui/pair-action.ts#pairAction",
  "blocks/device/ui/unlink-action.ts#unlinkDevice",

  // Заполнение на станции.
  "blocks/fill/ui/submit-action.ts#submitFillAction",
  "blocks/fill/ui/round-action.ts#markRoundAction",
  "blocks/fill/ui/alarm-action.ts#setAlarmAction",
  "blocks/fill/ui/alarm-action.ts#dropAlarmAction",
  "blocks/fill/ui/shift-mode-action.ts#chooseShiftModeAction",
];

/** Закрыто в демо: меняет доступ или выходит наружу. */
export const DEMO_LOCKED_ACTIONS: readonly string[] = [
  // Экран «Партнёры»: новая учётка с паролем пережила бы час до сброса, а смена пароля
  // или снятие учётки роли сломали бы вход всем посетителям.
  "blocks/auth/ui/partners-action.ts#submitCreatePartner",
  "blocks/auth/ui/partners-action.ts#submitChangePassword",
  "blocks/auth/ui/partners-action.ts#submitResetPassword",
  "blocks/auth/ui/partners-action.ts#submitDisableAccount",
  "blocks/auth/ui/partners-action.ts#submitBindEmail",
  "blocks/auth/ui/partners-action.ts#submitCreateHqMember",

  // Вход через Google: выход наружу, к настоящему сервису под настоящими реквизитами.
  "app/(public)/admin/login/google/route.ts#GET",
  "app/(public)/admin/login/google/callback/route.ts#GET",
];

/** Стенд демо ли это. Закрытое действие спрашивает именно это и отвечает отказом. */
export function demoLocked(): boolean {
  return isDemoMode();
}

/** Отказ обработчика маршрута: понятный текст на языке посетителя, а не пустая 403. */
export async function demoLockedResponse(): Promise<Response> {
  const t = await getTranslations("demo");
  return new Response(t("locked"), {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
