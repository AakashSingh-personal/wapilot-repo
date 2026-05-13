-- AlterTable
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "metaTemplateId" TEXT;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "metaSnapshot" JSONB;
