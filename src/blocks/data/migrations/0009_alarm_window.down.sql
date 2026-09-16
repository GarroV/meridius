-- Обратный ход 0009. Местные сутки восстанавливаются пересчётом, а не теряются: это
-- ровно дата звонка по местному времени пиццерии, а миг звонка будильник помнит сам.
ALTER TABLE "alarms" ADD COLUMN "local_date" date;
UPDATE "alarms"
   SET "local_date" = ("alarms"."at" at time zone "stores"."timezone")::date
  FROM "stations", "stores"
 WHERE "stations"."id" = "alarms"."station_id"
   AND "stores"."id" = "stations"."store_id";
ALTER TABLE "alarms" ALTER COLUMN "local_date" SET NOT NULL;
DROP INDEX IF EXISTS "alarms_station_at_idx";
CREATE INDEX "alarms_station_date_idx" ON "alarms" ("station_id", "local_date");
