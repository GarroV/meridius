-- Откат шаблонов и копий. Снимается вместе с памятью о происхождении: сохранять её
-- некуда, а держать колонку без смысла — хуже, чем убрать.
DROP INDEX IF EXISTS "checklists_template_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "checklists_source_idx";--> statement-breakpoint
ALTER TABLE "checklists" DROP CONSTRAINT IF EXISTS "checklists_template_has_no_station";--> statement-breakpoint
ALTER TABLE "checklists" DROP CONSTRAINT IF EXISTS "checklists_source_checklist_id_fk";--> statement-breakpoint
ALTER TABLE "checklists" DROP COLUMN IF EXISTS "source_version";--> statement-breakpoint
ALTER TABLE "checklists" DROP COLUMN IF EXISTS "source_checklist_id";--> statement-breakpoint
ALTER TABLE "checklists" DROP COLUMN IF EXISTS "is_template";
