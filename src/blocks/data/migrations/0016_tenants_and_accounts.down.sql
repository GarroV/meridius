-- Откат тенантов: кабинет возвращается к одному паролю из окружения (D014). Учётные
-- записи партнёров и их страны при этом теряются — восстановить их откатом наката нельзя.
ALTER TABLE "checklists" DROP CONSTRAINT IF EXISTS "checklists_tenant_id_fk";
DROP INDEX IF EXISTS "checklists_tenant_idx";
ALTER TABLE "checklists" DROP COLUMN IF EXISTS "tenant_id";
DROP TABLE IF EXISTS "accounts";
DROP TABLE IF EXISTS "tenant_countries";
DROP TABLE IF EXISTS "tenants";
