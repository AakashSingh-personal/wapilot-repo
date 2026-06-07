-- Booking idempotency keys (prevent duplicate appointments on retry)
CREATE TABLE "BookingIdempotencyKey" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "appointmentId" UUID,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BookingIdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingIdempotencyKey_businessId_idempotencyKey_key"
  ON "BookingIdempotencyKey"("businessId", "idempotencyKey");
CREATE INDEX "BookingIdempotencyKey_expiresAt_idx" ON "BookingIdempotencyKey"("expiresAt");

ALTER TABLE "BookingIdempotencyKey"
  ADD CONSTRAINT "BookingIdempotencyKey_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
