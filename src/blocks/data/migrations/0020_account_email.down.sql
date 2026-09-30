-- Обратный ход 0020: почта учётки уходит вместе с входом через Google.
--
-- Код до этой миграции её не читает; после отката учётки входят только паролем.
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_email_shape";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_email_unique";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "email";
