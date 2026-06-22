-- Phase 2: Shift Management

CREATE TYPE "ShiftType" AS ENUM ('FIXED', 'ROTATIONAL', 'SPLIT', 'FLEXIBLE');

CREATE TABLE "ShiftTemplate" (
  "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
  "businessId"       UUID        NOT NULL,
  "name"             TEXT        NOT NULL,
  "type"             "ShiftType" NOT NULL DEFAULT 'FIXED',
  "startTime"        TEXT        NOT NULL,
  "endTime"          TEXT        NOT NULL,
  "splitStartTime2"  TEXT,
  "splitEndTime2"    TEXT,
  "breakMinutes"     INTEGER     NOT NULL DEFAULT 0,
  "graceLateMinutes" INTEGER     NOT NULL DEFAULT 0,
  "isActive"         BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShiftTemplate_businessId_isActive_idx" ON "ShiftTemplate"("businessId", "isActive");

CREATE TABLE "StaffShiftAssignment" (
  "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
  "businessId"       UUID        NOT NULL,
  "staffId"          UUID        NOT NULL,
  "shiftId"          UUID        NOT NULL,
  "effectiveFrom"    DATE        NOT NULL,
  "effectiveTo"      DATE,
  "rotationCycleDay" INTEGER,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "StaffShiftAssignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StaffShiftAssignment"
  ADD CONSTRAINT "StaffShiftAssignment_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "StaffShiftAssignment_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "ShiftTemplate"("id") ON DELETE CASCADE;

CREATE INDEX "StaffShiftAssignment_staffId_effectiveFrom_idx"
  ON "StaffShiftAssignment"("staffId", "effectiveFrom");

CREATE INDEX "StaffShiftAssignment_businessId_idx"
  ON "StaffShiftAssignment"("businessId");
