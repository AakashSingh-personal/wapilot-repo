-- Phase 3: Commission Calculation Engine

CREATE TYPE "CommissionType" AS ENUM (
  'PERCENTAGE', 'FIXED', 'TIER', 'PRODUCT', 'TEAM'
);

CREATE TYPE "CommissionStatus" AS ENUM (
  'PENDING', 'APPROVED', 'PAID'
);

CREATE TABLE "CommissionRule" (
  "id"            UUID              NOT NULL DEFAULT gen_random_uuid(),
  "businessId"    UUID              NOT NULL,
  "staffId"       UUID,
  "serviceId"     UUID,
  "type"          "CommissionType"  NOT NULL,
  "value"         DECIMAL(12, 4)    NOT NULL DEFAULT 0,
  "tierSlabs"     JSONB             NOT NULL DEFAULT '[]',
  "teamManagerId" UUID,
  "priority"      INTEGER           NOT NULL DEFAULT 0,
  "isActive"      BOOLEAN           NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommissionRule_businessId_isActive_idx" ON "CommissionRule"("businessId", "isActive");
CREATE INDEX "CommissionRule_businessId_staffId_idx"  ON "CommissionRule"("businessId", "staffId");

CREATE TABLE "CommissionRecord" (
  "id"               UUID               NOT NULL DEFAULT gen_random_uuid(),
  "businessId"       UUID               NOT NULL,
  "staffId"          UUID               NOT NULL,
  "appointmentId"    UUID               NOT NULL,
  "ruleId"           UUID,
  "calculatedAmount" DECIMAL(12, 2)     NOT NULL,
  "status"           "CommissionStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById"     UUID,
  "approvedAt"       TIMESTAMPTZ,
  "paymentBatchId"   TEXT,
  "paidAt"           TIMESTAMPTZ,
  "notes"            TEXT,
  "createdAt"        TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT "CommissionRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CommissionRecord"
  ADD CONSTRAINT "CommissionRecord_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "CommissionRecord_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "CommissionRecord_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "CommissionRule"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX "CommissionRecord_biz_staff_appt_key"
  ON "CommissionRecord"("businessId", "staffId", "appointmentId");

CREATE INDEX "CommissionRecord_businessId_status_idx"
  ON "CommissionRecord"("businessId", "status");

CREATE INDEX "CommissionRecord_businessId_staffId_status_idx"
  ON "CommissionRecord"("businessId", "staffId", "status");
