ALTER TABLE "BusinessConfig" ADD COLUMN IF NOT EXISTS "schedulingSettings" JSONB NOT NULL DEFAULT '{}';
