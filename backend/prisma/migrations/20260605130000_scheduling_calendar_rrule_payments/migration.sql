ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "calendarEventId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "calendarConnectionId" UUID;

CREATE TABLE IF NOT EXISTS "StaffAvailabilityRule" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL,
  "staffId" UUID NOT NULL REFERENCES "StaffMember"("id") ON DELETE CASCADE,
  "locationId" UUID,
  "ruleType" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "rrule" TEXT NOT NULL,
  "startTime" TEXT,
  "endTime" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  "validFrom" TIMESTAMPTZ,
  "validUntil" TIMESTAMPTZ,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "StaffAvailabilityRule_staffId_isActive_idx"
  ON "StaffAvailabilityRule"("staffId", "isActive");
