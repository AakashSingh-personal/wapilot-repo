-- Phase 1: Geo Check-In / Check-Out & Attendance Tracking

-- Enums
CREATE TYPE "AttendanceStatus" AS ENUM (
  'PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WFH', 'FIELD_DUTY'
);

CREATE TYPE "CheckInSource" AS ENUM (
  'GEO', 'QR', 'MANUAL', 'BIOMETRIC'
);

CREATE TYPE "OutsideRadiusAction" AS ENUM (
  'WARN', 'REQUIRE_APPROVAL', 'REJECT'
);

-- Extend Location with geo-fence config
ALTER TABLE "Location"
  ADD COLUMN "geoFenceEnabled"     BOOLEAN              NOT NULL DEFAULT FALSE,
  ADD COLUMN "allowedRadiusMeters" INTEGER              NOT NULL DEFAULT 100,
  ADD COLUMN "outsideRadiusAction" "OutsideRadiusAction" NOT NULL DEFAULT 'WARN';

-- Extend StaffMember with QR token for QR check-in
ALTER TABLE "StaffMember"
  ADD COLUMN "qrToken" TEXT;

CREATE UNIQUE INDEX "StaffMember_qrToken_key" ON "StaffMember"("qrToken");

-- AttendanceRecord table
CREATE TABLE "AttendanceRecord" (
  "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
  "businessId"        UUID        NOT NULL,
  "staffId"           UUID        NOT NULL,
  "locationId"        UUID,
  "date"              DATE        NOT NULL,
  "status"            "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
  "checkInTime"       TIMESTAMPTZ,
  "checkInLat"        DECIMAL(10,7),
  "checkInLng"        DECIMAL(10,7),
  "checkInSource"     "CheckInSource",
  "checkInDeviceInfo" JSONB       NOT NULL DEFAULT '{}',
  "checkInSelfieUrl"  TEXT,
  "checkInDistanceM"  INTEGER,
  "checkOutTime"      TIMESTAMPTZ,
  "checkOutLat"       DECIMAL(10,7),
  "checkOutLng"       DECIMAL(10,7),
  "workingMinutes"    INTEGER,
  "outsideRadius"     BOOLEAN     NOT NULL DEFAULT FALSE,
  "approvedById"      UUID,
  "approvedAt"        TIMESTAMPTZ,
  "notes"             TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "AttendanceRecord_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "AttendanceRecord_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL;

-- Indexes
CREATE UNIQUE INDEX "AttendanceRecord_businessId_staffId_date_key"
  ON "AttendanceRecord"("businessId", "staffId", "date");

CREATE INDEX "AttendanceRecord_businessId_date_idx"
  ON "AttendanceRecord"("businessId", "date");

CREATE INDEX "AttendanceRecord_staffId_date_idx"
  ON "AttendanceRecord"("staffId", "date");
