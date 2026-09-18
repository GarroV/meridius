-- Обратный ход 0012: правило «одно заполнение — одна запись» снимается, пометка
-- повторов уходит вместе с колонкой. Сами записи не трогаются ни в одну сторону:
-- помеченный повтор остаётся в истории, как оставался и до отката.
DROP INDEX IF EXISTS "submissions_one_per_filling_idx";
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "duplicate";
