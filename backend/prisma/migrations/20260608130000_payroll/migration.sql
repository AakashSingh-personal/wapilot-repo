-- Phase 4: Payroll Integration

CREATE TYPE "PayrollFrequency" AS ENUM ('MONTHLY', 'WEEKLY', 'BIWEEKLY');
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PAID');

CREATE TABLE "PayrollConfig" (
  "id"                    UUID        NOT NULL DEFAULT gen_random_uuid(),
  "businessId"            UUID        NOT NULL,
  "frequency"             "PayrollFrequency" NOT NULL DEFAULT 'MONTHLY',
  "payDay"                INTEGER     NOT NULL DEFAULT 1,
  "cutoffDay"             INTEGER     NOT NULL DEFAULT 25,
  "overtimeRatePerHour"   DECIMAL(10,2) NOT NULL DEFAULT 0,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PayrollConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollConfig_businessId_key" UNIQUE ("businessId")
);

CREATE TABLE "StaffPayrollConfig" (
  "id"                       UUID         NOT NULL DEFAULT gen_random_uuid(),
  "businessId"               UUID         NOT NULL,
  "staffId"                  UUID         NOT NULL,
  "basicSalary"              DECIMAL(12,2) NOT NULL DEFAULT 0,
  "travelAllowance"          DECIMAL(12,2) NOT NULL DEFAULT 0,
  "pfEnabled"                BOOLEAN      NOT NULL DEFAULT false,
  "pfRate"                   DECIMAL(5,2)  NOT NULL DEFAULT 12,
  "esiEnabled"               BOOLEAN      NOT NULL DEFAULT false,
  "esiRate"                  DECIMAL(5,2)  NOT NULL DEFAULT 0.75,
  "taxRate"                  DECIMAL(5,2)  NOT NULL DEFAULT 0,
  "lateDeductionPerMinute"   DECIMAL(8,4)  NOT NULL DEFAULT 0,
  "leaveDayDeductionRate"    DECIMAL(5,4)  NOT NULL DEFAULT 1,
  "bankAccountNumber"        TEXT,
  "bankIfsc"                 TEXT,
  "bankAccountName"          TEXT,
  "createdAt"                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "StaffPayrollConfig_pkey"    PRIMARY KEY ("id"),
  CONSTRAINT "StaffPayrollConfig_staffId_key" UNIQUE ("staffId"),
  CONSTRAINT "StaffPayrollConfig_staff_fk" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE
);
CREATE INDEX "StaffPayrollConfig_businessId_idx" ON "StaffPayrollConfig"("businessId");

CREATE TABLE "PayrollRun" (
  "id"          UUID             NOT NULL DEFAULT gen_random_uuid(),
  "businessId"  UUID             NOT NULL,
  "periodStart" DATE             NOT NULL,
  "periodEnd"   DATE             NOT NULL,
  "status"      "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
  "generatedAt" TIMESTAMPTZ,
  "finalizedAt" TIMESTAMPTZ,
  "paidAt"      TIMESTAMPTZ,
  "notes"       TEXT,
  "createdAt"   TIMESTAMPTZ      NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ      NOT NULL DEFAULT now(),
  CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayrollRun_businessId_status_idx"      ON "PayrollRun"("businessId", "status");
CREATE INDEX "PayrollRun_businessId_periodStart_idx" ON "PayrollRun"("businessId", "periodStart");

CREATE TABLE "PayrollEntry" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "businessId"      UUID         NOT NULL,
  "payrollRunId"    UUID         NOT NULL,
  "staffId"         UUID         NOT NULL,
  "basicSalary"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "travelAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "overtime"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  "commission"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "bonus"           DECIMAL(12,2) NOT NULL DEFAULT 0,
  "grossEarnings"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "leaveDeduction"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  "lateDeduction"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "pf"              DECIMAL(12,2) NOT NULL DEFAULT 0,
  "esi"             DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tax"             DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netPay"          DECIMAL(12,2) NOT NULL DEFAULT 0,
  "presentDays"     INTEGER      NOT NULL DEFAULT 0,
  "absentDays"      INTEGER      NOT NULL DEFAULT 0,
  "halfDays"        INTEGER      NOT NULL DEFAULT 0,
  "leaveDays"       INTEGER      NOT NULL DEFAULT 0,
  "lateMinutes"     INTEGER      NOT NULL DEFAULT 0,
  "overtimeMinutes" INTEGER      NOT NULL DEFAULT 0,
  "slipPdfUrl"      TEXT,
  "createdAt"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "PayrollEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollEntry_run_staff_unique" UNIQUE ("payrollRunId", "staffId"),
  CONSTRAINT "PayrollEntry_run_fk"   FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE,
  CONSTRAINT "PayrollEntry_staff_fk" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE RESTRICT
);
CREATE INDEX "PayrollEntry_businessId_staffId_idx" ON "PayrollEntry"("businessId", "staffId");
