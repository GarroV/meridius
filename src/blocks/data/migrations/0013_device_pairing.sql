-- Привязка планшета станции (D132, D133): две таблицы и ни одной колонки владельца.
--
-- `devices` — живые привязки. Строка и есть право планшета показывать чек-лист: кука
-- несёт только опознаватель, и подпись без строки не значит ничего. Отвязка — удаление
-- строки, а не пометка: журнала устройств пилоту не нужно.
--
-- `device_pairings` — живые пины. Одноразовость проверяется в самом запросе съедания,
-- а уникальность кода — частичным индексом среди несъеденных: `now()` для индекса не
-- годится, поэтому «среди живых» выразить индексом нельзя, и истёкшие несъеденные
-- чистятся тем же запросом, что выпускает новый пин.
--
-- Каскад, а не `restrict`: привязка к удалённой станции — мусор, а не история, и
-- хранить её нечего (D050, D051 — владелец приходит через станцию).
CREATE TABLE "devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "station_id" uuid NOT NULL,
  "paired_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_station_id_stations_id_fk"
  FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_station_idx" ON "devices" USING btree ("station_id");--> statement-breakpoint
CREATE TABLE "device_pairings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "station_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  CONSTRAINT "device_pairings_code_shape" CHECK (code ~ '^[0-9]{4}$')
);--> statement-breakpoint
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_station_id_stations_id_fk"
  FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_pairings_live_code_idx" ON "device_pairings" USING btree ("code") WHERE "used_at" is null;--> statement-breakpoint
CREATE INDEX "device_pairings_station_idx" ON "device_pairings" USING btree ("station_id");
