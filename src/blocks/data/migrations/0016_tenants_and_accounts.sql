-- Учётные записи и тенанты (D145, снимает D014).
--
-- До этой миграции у кабинета был один пароль на всех, и вошедший видел всю сеть. Теперь
-- вход — это учётная запись, учётная запись принадлежит тенанту, а тенант задаёт область
-- видимости на ВЕСЬ кабинет: УК видит все страны, партнёр — только свои (D145, дословно:
-- «для пространства УК соответственно все страны доступны, у партнеров будут только они
-- сами»).
--
-- УК в базе ровно одна — частичный уникальный индекс, а не соглашение. Её строка
-- заводится здесь же: у существующих чек-листов должен быть хозяин, и хозяин у них один —
-- до этой миграции кабинетом пользовалась только УК.
--
-- Страны партнёра — отдельная таблица, а не массив в строке тенанта: удалённая страна
-- снимается со всех тенантов внешним ключом, а массив держал бы мёртвый идентификатор, и
-- проверка области видимости сравнивала бы с ним молча. У УК строк здесь нет и быть не
-- должно: «все страны» — это отсутствие фильтра, а не список, который отстаёт от сети
-- на каждую новую страну.
CREATE TABLE "tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenants_kind" CHECK (kind in ('hq', 'partner')),
  CONSTRAINT "tenants_name_length" CHECK (length(btrim(name)) between 1 and 120)
);--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_single_hq" ON "tenants" USING btree ("kind") WHERE "kind" = 'hq';--> statement-breakpoint
INSERT INTO "tenants" ("kind", "name") VALUES ('hq', 'УК');--> statement-breakpoint
CREATE TABLE "tenant_countries" (
  "tenant_id" uuid NOT NULL,
  "country_id" uuid NOT NULL,
  CONSTRAINT "tenant_countries_pk" PRIMARY KEY ("tenant_id", "country_id")
);--> statement-breakpoint
ALTER TABLE "tenant_countries" ADD CONSTRAINT "tenant_countries_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_countries" ADD CONSTRAINT "tenant_countries_country_id_fk"
  FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_countries_country_idx" ON "tenant_countries" USING btree ("country_id");--> statement-breakpoint
-- Логин — строчные латинские буквы, цифры и `._-`: его вводят руками на входе, и два
-- логина, отличающиеся регистром или пробелом по краям, были бы одной учёткой для
-- человека и двумя для базы. `admin` занят учётной записью УК из окружения площадки
-- (`ADMIN_PASSWORD_HASH`) и в базе запрещён: иначе один логин открывал бы две учётки.
CREATE TABLE "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "login" text NOT NULL,
  "password_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "disabled_at" timestamp with time zone,
  CONSTRAINT "accounts_login_unique" UNIQUE ("login"),
  CONSTRAINT "accounts_login_shape" CHECK (login ~ '^[a-z0-9._-]{3,64}$'),
  CONSTRAINT "accounts_login_not_root" CHECK (login <> 'admin'),
  CONSTRAINT "accounts_password_hash_shape" CHECK (password_hash ~ '^scrypt[.]')
);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_tenant_idx" ON "accounts" USING btree ("tenant_id");--> statement-breakpoint
-- Хозяин чек-листа. Без него «мой чек-лист» (D148) не отличить от чужого, а чек-лист без
-- станции не принадлежит ни одной стране и в области видимости не находится вовсе.
-- Существующие чек-листы отданы УК: до этой миграции кабинет был только у неё.
ALTER TABLE "checklists" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
UPDATE "checklists" SET "tenant_id" = (SELECT "id" FROM "tenants" WHERE "kind" = 'hq');--> statement-breakpoint
ALTER TABLE "checklists" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklists_tenant_idx" ON "checklists" USING btree ("tenant_id");
