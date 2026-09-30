-- Почта учётки кабинета для входа через Google (D176, #177).
--
-- Google отдаёт подтверждённую почту, и вход пускает только учётку, к которой эта почта
-- заранее привязана: учётки по почте не заводятся, неизвестная почта — отказ.
--
-- Пусто — почта не привязана, учётка входит только логином и паролем. Хранится уже
-- приведённой (без пробелов, в нижнем регистре) — сравнение на входе идёт равенством.
-- Уникальна на всю базу, а не на тенант: одна почта, открывающая две учётки, заставила
-- бы вход угадывать, куда пустить.
ALTER TABLE "accounts" ADD COLUMN "email" text;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_email_unique" UNIQUE ("email");
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_email_shape"
  CHECK (email IS NULL OR (email = lower(btrim(email)) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' AND length(email) <= 254));
