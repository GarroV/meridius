-- Город и код точки у пиццерии (#141, D145).
--
-- До этой миграции у пиццерии было только название, и импорт справочника сети опознавал
-- строки по нему: переименовали пиццерию на экране — следующий прогон заводил её заново,
-- рядом, и различить дубль было нечем. Город приходилось вклеивать в название
-- («Warsaw, Bemowo»), и методист, заводящий пиццерию руками, об этом правиле не знал.
--
-- Код точки — опознаватель пиццерии в справочнике сети: уникален в пределах страны,
-- потому что нумерацию ведёт каждая страна у себя (и тенант партнёра видит свои страны
-- целиком, D145). Уникальный индекс, а не ограничение таблицы: в PostgreSQL пустые
-- значения в нём различны, и пиццерии без кода не мешают друг другу.
--
-- Оба поля необязательны: 145 пиццерий, заведённых до миграции, остаются валидными без
-- них, и заполнять их догадкой миграция не вправе — кода у них нет в источнике.
-- Пустая строка и пробел по краю запрещены: «P-1» и «P-1 » были бы одной точкой для
-- человека и двумя для индекса.
ALTER TABLE "stores" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_city_shape"
  CHECK (city is null or (city = btrim(city) and length(city) between 1 and 120));--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_code_shape"
  CHECK (code is null or (code = btrim(code) and length(code) between 1 and 64));--> statement-breakpoint
CREATE UNIQUE INDEX "stores_country_code_uq" ON "stores" USING btree ("country_id", "code");
