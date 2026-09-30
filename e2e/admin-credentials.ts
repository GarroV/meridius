/**
 * Учётные данные ТОЛЬКО для сквозных сценариев. Секретом не являются: сервер под тесты
 * поднимает playwright.config.ts с этими значениями, наружу они не уезжают, а рабочие
 * `ADMIN_PASSWORD_HASH` и `SESSION_SECRET` живут в `.env` и в git не попадают.
 */
export const E2E_ADMIN_PASSWORD = "e2e-пароль-администратора";

/** Хэш пароля выше, посчитанный рабочими параметрами scrypt. */
export const E2E_ADMIN_PASSWORD_HASH =
  "scrypt.32768.8.3.GcNmcKxhVZrQhq_AzNTkUA.YI_JB0SIPiRmRJh_txJl5LKtv-dMITTtsV_Tv-B9c9I";

export const E2E_SESSION_SECRET =
  "e2e-секрет-подписи-сессии-длиннее-32-знаков-0123456789";

/**
 * Секрет подписи куки ПЛАНШЕТА. Отдельный от секрета кабинета нарочно: продукт
 * отказывается стартовать, если они совпали, — украденная кука одного не должна
 * открывать другое.
 */
export const E2E_DEVICE_SESSION_SECRET =
  "e2e-секрет-подписи-планшета-длиннее-32-знаков-0123456789";

/**
 * Реквизиты Google для сквозных сценариев (D176): выдуманы, у Google такого клиента нет.
 * Нужны, чтобы кнопка «Войти через Google» появилась и маршруты входа включились; до
 * обмена кода сценарии не доходят — отказ на метке случается раньше.
 */
export const E2E_GOOGLE_CLIENT_ID = "e2e-meridius.apps.googleusercontent.com";
export const E2E_GOOGLE_CLIENT_SECRET = "e2e-не-секрет-клиента-google";
export const E2E_GOOGLE_REDIRECT_URI =
  "https://meridius.e2e.example/admin/login/google/callback";
