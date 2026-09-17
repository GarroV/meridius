-- Обратный ход 0011: имена возвращаются, содержимое не трогается. Строки живут
-- пятнадцать минут, и смысл их после отката читается прежним кодом так же.
ALTER TABLE "login_attempts" RENAME CONSTRAINT "login_attempts_attempts_positive" TO "login_failures_failures_positive";
ALTER TABLE "login_attempts" RENAME CONSTRAINT "login_attempts_attempt_key_shape" TO "login_failures_attempt_key_shape";
ALTER TABLE "login_attempts" RENAME CONSTRAINT "login_attempts_pkey" TO "login_failures_pkey";
ALTER TABLE "login_attempts" RENAME COLUMN "attempts" TO "failures";
ALTER TABLE "login_attempts" RENAME TO "login_failures";
