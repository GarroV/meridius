-- Откат города и кода точки: пиццерии возвращаются к одному названию, импорт снова
-- опознаёт их по имени. Коды и города, заведённые после миграции, теряются вместе с
-- колонками — история заполнений их не касается.
DROP INDEX IF EXISTS "stores_country_code_uq";
ALTER TABLE "stores" DROP CONSTRAINT IF EXISTS "stores_code_shape";
ALTER TABLE "stores" DROP CONSTRAINT IF EXISTS "stores_city_shape";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "code";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "city";
