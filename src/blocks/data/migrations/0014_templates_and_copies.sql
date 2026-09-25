-- Шаблоны и копии (D149, D155).
--
-- Слово «чек-лист» означало у продукта три разные вещи сразу: образец, составленный УК;
-- документ, живущий на одной станции; замороженную версию, по которой заполняли. В базе
-- это была одна таблица, и человек справедливо не понимал, что именно он правит.
--
-- `is_template` разделяет первые две. Шаблон — то, что УК показывает странам: НЕ стандарт
-- сети и ни к чему не обязывает (D154, дословно владельцем: «просто подспорье чтобы
-- освоиться с функционалом + это то как мы видим ведение смены в идеале»). Страна шаблон
-- не правит, а делает копию.
--
-- Шаблон не висит на станции, и это ограничение, а не соглашение: висящий шаблон означал
-- бы, что где-то в сети по образцу заполняют вживую, а правка образца молча меняет работу
-- пиццерии. Проверка стоит в базе, потому что назначить станцию умеют три разных места.
--
-- `source_checklist_id` и `source_version` — память копии о происхождении (D155, дословно:
-- «идея с помнит источник мне нравится, давай сделаем»). Без них правка шаблона не доезжает
-- ни до одной копии иначе как руками, и продукт не может даже сказать «шаблон обновился».
-- Это НЕ живая ссылка: копия остаётся хозяйством страны, а номер версии позволяет отличить
-- «копия свежая» от «шаблон ушёл вперёд».
--
-- `on delete set null` у источника: удалённый шаблон не должен утаскивать за собой копии,
-- которые по нему уже работают на станциях. Копия просто перестаёт знать, откуда она.
ALTER TABLE "checklists" ADD COLUMN "is_template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "checklists" ADD COLUMN "source_checklist_id" uuid;--> statement-breakpoint
ALTER TABLE "checklists" ADD COLUMN "source_version" integer;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_source_checklist_id_fk"
  FOREIGN KEY ("source_checklist_id") REFERENCES "public"."checklists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_template_has_no_station"
  CHECK (NOT "is_template" OR "station_id" IS NULL);--> statement-breakpoint
CREATE INDEX "checklists_source_idx" ON "checklists" USING btree ("source_checklist_id");--> statement-breakpoint
-- Частичный: шаблонов десятки при тысячах копий, и полный индекс тут был бы данью форме.
CREATE INDEX "checklists_template_idx" ON "checklists" USING btree ("id") WHERE "is_template";
