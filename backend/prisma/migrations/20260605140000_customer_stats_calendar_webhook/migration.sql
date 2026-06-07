-- Customer appointment stats (denormalized for variables + analytics)
CREATE TABLE IF NOT EXISTS "CustomerAppointmentStats" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL,
  "customerId" UUID NOT NULL UNIQUE REFERENCES "Customer"("id") ON DELETE CASCADE,
  "totalVisits" INTEGER NOT NULL DEFAULT 0,
  "lifetimeSpend" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "lastVisitAt" TIMESTAMPTZ,
  "nextVisitAt" TIMESTAMPTZ,
  "favoriteStaffId" UUID,
  "favoriteServiceId" UUID,
  "avgRating" DECIMAL(3,2),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerAppointmentStats_businessId_customerId_key"
  ON "CustomerAppointmentStats"("businessId", "customerId");
CREATE INDEX IF NOT EXISTS "CustomerAppointmentStats_businessId_idx"
  ON "CustomerAppointmentStats"("businessId");

-- Service rebooking interval for AI campaigns
ALTER TABLE "ScheduledService" ADD COLUMN IF NOT EXISTS "rebookingIntervalDays" INTEGER;

-- Google Calendar push webhook metadata
ALTER TABLE "CalendarConnection" ADD COLUMN IF NOT EXISTS "webhookChannelId" TEXT;
ALTER TABLE "CalendarConnection" ADD COLUMN IF NOT EXISTS "webhookResourceId" TEXT;
ALTER TABLE "CalendarConnection" ADD COLUMN IF NOT EXISTS "webhookExpiresAt" TIMESTAMPTZ;

-- DB-level double-booking guard (active appointments per staff)
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staff_no_overlap"
    EXCLUDE USING gist (
      "staffId" WITH =,
      tstzrange("startAt", "endAt", '[)') WITH &&
    )
    WHERE (status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
