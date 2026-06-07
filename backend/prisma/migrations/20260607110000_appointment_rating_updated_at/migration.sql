-- Add updatedAt to AppointmentRating so the rating re-submission throttle
-- (RATING_THROTTLE_MS) can check when a rating was last modified.

ALTER TABLE "AppointmentRating"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();
