-- Optional email for appointment reminders
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "email" TEXT;
