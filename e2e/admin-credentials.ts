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
