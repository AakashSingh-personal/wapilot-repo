-- Staff Scheduling & Appointment Booking module

CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "LeaveType" AS ENUM ('SICK', 'VACATION', 'EMERGENCY', 'HOLIDAY', 'OTHER');
CREATE TYPE "AppointmentType" AS ENUM ('IN_PERSON', 'ONLINE', 'HOME_VISIT');
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'RESCHEDULED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "ApptPaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'REFUNDED', 'FAILED');
CREATE TYPE "WaitlistStatus" AS ENUM ('ACTIVE', 'NOTIFIED', 'BOOKED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "ReminderChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS');
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED');

CREATE TABLE "Location" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "addressLine1" TEXT,
  "city" TEXT,
  "state" TEXT,
  "country" TEXT NOT NULL DEFAULT 'IN',
  "postalCode" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  "phone" TEXT,
  "email" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt" TIMESTAMPTZ,
  UNIQUE ("businessId", "code")
);

CREATE TABLE "StaffMember" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "userId" UUID UNIQUE REFERENCES "User"("id") ON DELETE SET NULL,
  "staffCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "mobile" TEXT,
  "profilePicture" TEXT,
  "designation" TEXT,
  "department" TEXT,
  "bio" TEXT,
  "skills" JSONB NOT NULL DEFAULT '[]',
  "activeStatus" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt" TIMESTAMPTZ,
  UNIQUE ("businessId", "staffCode")
);

CREATE TABLE "StaffLocation" (
  "staffId" UUID NOT NULL REFERENCES "StaffMember"("id") ON DELETE CASCADE,
  "locationId" UUID NOT NULL REFERENCES "Location"("id") ON DELETE CASCADE,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY ("staffId", "locationId")
);

CREATE TABLE "ServiceCategory" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "sortOrder" INT NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  UNIQUE ("businessId", "name")
);

CREATE TABLE "ScheduledService" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "categoryId" UUID REFERENCES "ServiceCategory"("id") ON DELETE SET NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "durationMin" INT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "bufferBefore" INT NOT NULL DEFAULT 0,
  "bufferAfter" INT NOT NULL DEFAULT 0,
  "maxCapacity" INT NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt" TIMESTAMPTZ,
  UNIQUE ("businessId", "code")
);

CREATE TABLE "StaffService" (
  "staffId" UUID NOT NULL REFERENCES "StaffMember"("id") ON DELETE CASCADE,
  "serviceId" UUID NOT NULL REFERENCES "ScheduledService"("id") ON DELETE CASCADE,
  PRIMARY KEY ("staffId", "serviceId")
);

CREATE TABLE "StaffWorkingHours" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL,
  "staffId" UUID NOT NULL REFERENCES "StaffMember"("id") ON DELETE CASCADE,
  "locationId" UUID REFERENCES "Location"("id") ON DELETE SET NULL,
  "dayOfWeek" INT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE "StaffBreak" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "staffId" UUID NOT NULL REFERENCES "StaffMember"("id") ON DELETE CASCADE,
  "locationId" UUID,
  "dayOfWeek" INT,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "breakType" TEXT NOT NULL DEFAULT 'LUNCH',
  "isRecurring" BOOLEAN NOT NULL DEFAULT true,
  "specificDate" TIMESTAMPTZ
);

CREATE TABLE "StaffLeave" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL,
  "staffId" UUID NOT NULL REFERENCES "StaffMember"("id") ON DELETE CASCADE,
  "leaveType" "LeaveType" NOT NULL,
  "startAt" TIMESTAMPTZ NOT NULL,
  "endAt" TIMESTAMPTZ NOT NULL,
  "reason" TEXT,
  "approvedById" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "BusinessHoliday" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "locationId" UUID REFERENCES "Location"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "startAt" TIMESTAMPTZ NOT NULL,
  "endAt" TIMESTAMPTZ NOT NULL,
  "isRecurring" BOOLEAN NOT NULL DEFAULT false,
  "rrule" TEXT
);

CREATE TABLE "Appointment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "appointmentNumber" TEXT NOT NULL,
  "customerId" UUID NOT NULL REFERENCES "Customer"("id") ON DELETE CASCADE,
  "staffId" UUID NOT NULL REFERENCES "StaffMember"("id") ON DELETE RESTRICT,
  "serviceId" UUID NOT NULL REFERENCES "ScheduledService"("id") ON DELETE RESTRICT,
  "locationId" UUID NOT NULL REFERENCES "Location"("id") ON DELETE RESTRICT,
  "appointmentType" "AppointmentType" NOT NULL DEFAULT 'IN_PERSON',
  "startAt" TIMESTAMPTZ NOT NULL,
  "endAt" TIMESTAMPTZ NOT NULL,
  "bufferBeforeMin" INT NOT NULL DEFAULT 0,
  "bufferAfterMin" INT NOT NULL DEFAULT 0,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
  "notes" TEXT,
  "internalNotes" TEXT,
  "meetingLink" TEXT,
  "address" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "paymentStatus" "ApptPaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "amountDue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'DASHBOARD',
  "version" INT NOT NULL DEFAULT 1,
  "cancelledAt" TIMESTAMPTZ,
  "cancellationReason" TEXT,
  "checkedInAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "legacyBookingId" UUID,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("businessId", "appointmentNumber")
);

CREATE TABLE "AppointmentStatusHistory" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "appointmentId" UUID NOT NULL REFERENCES "Appointment"("id") ON DELETE CASCADE,
  "fromStatus" "AppointmentStatus",
  "toStatus" "AppointmentStatus" NOT NULL,
  "changedById" UUID,
  "reason" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "WaitlistEntry" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "customerId" UUID NOT NULL REFERENCES "Customer"("id") ON DELETE CASCADE,
  "serviceId" UUID NOT NULL REFERENCES "ScheduledService"("id") ON DELETE CASCADE,
  "staffId" UUID REFERENCES "StaffMember"("id") ON DELETE SET NULL,
  "locationId" UUID NOT NULL REFERENCES "Location"("id") ON DELETE CASCADE,
  "preferredDate" TIMESTAMPTZ,
  "preferredStart" TEXT,
  "preferredEnd" TEXT,
  "priorityScore" INT NOT NULL DEFAULT 100,
  "status" "WaitlistStatus" NOT NULL DEFAULT 'ACTIVE',
  "notifiedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "AppointmentPayment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL,
  "appointmentId" UUID NOT NULL REFERENCES "Appointment"("id") ON DELETE CASCADE,
  "amount" DECIMAL(12,2) NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "transactionId" TEXT,
  "provider" TEXT,
  "providerRef" TEXT,
  "status" "ApptPaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "paidAt" TIMESTAMPTZ,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "ReminderSchedule" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL,
  "appointmentId" UUID NOT NULL REFERENCES "Appointment"("id") ON DELETE CASCADE,
  "channel" "ReminderChannel" NOT NULL DEFAULT 'WHATSAPP',
  "scheduledAt" TIMESTAMPTZ NOT NULL,
  "offsetMinutes" INT NOT NULL,
  "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
  "payload" JSONB NOT NULL DEFAULT '{}',
  "sentAt" TIMESTAMPTZ,
  "failureReason" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "AppointmentRating" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL,
  "appointmentId" UUID NOT NULL UNIQUE REFERENCES "Appointment"("id") ON DELETE CASCADE,
  "customerId" UUID NOT NULL REFERENCES "Customer"("id") ON DELETE CASCADE,
  "staffId" UUID NOT NULL REFERENCES "StaffMember"("id") ON DELETE CASCADE,
  "serviceId" UUID NOT NULL REFERENCES "ScheduledService"("id") ON DELETE CASCADE,
  "rating" INT NOT NULL,
  "feedback" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "AiBookingSession" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL,
  "customerId" UUID NOT NULL UNIQUE REFERENCES "Customer"("id") ON DELETE CASCADE,
  "intent" TEXT NOT NULL DEFAULT 'BOOK',
  "state" JSONB NOT NULL DEFAULT '{}',
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "CalendarConnection" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "staffId" UUID REFERENCES "StaffMember"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL,
  "externalEmail" TEXT,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "tokenExpiresAt" TIMESTAMPTZ,
  "calendarId" TEXT,
  "syncDirection" TEXT NOT NULL DEFAULT 'BIDIRECTIONAL',
  "lastSyncAt" TIMESTAMPTZ,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "CalendarBlockedSlot" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL,
  "staffId" UUID NOT NULL REFERENCES "StaffMember"("id") ON DELETE CASCADE,
  "connectionId" UUID NOT NULL REFERENCES "CalendarConnection"("id") ON DELETE CASCADE,
  "externalEventId" TEXT NOT NULL,
  "startAt" TIMESTAMPTZ NOT NULL,
  "endAt" TIMESTAMPTZ NOT NULL,
  "title" TEXT,
  "source" TEXT NOT NULL DEFAULT 'EXTERNAL',
  UNIQUE ("connectionId", "externalEventId")
);

CREATE INDEX "Location_businessId_idx" ON "Location"("businessId");
CREATE INDEX "StaffMember_businessId_activeStatus_idx" ON "StaffMember"("businessId", "activeStatus");
CREATE INDEX "ScheduledService_businessId_isActive_idx" ON "ScheduledService"("businessId", "isActive");
CREATE INDEX "StaffWorkingHours_staffId_dayOfWeek_idx" ON "StaffWorkingHours"("staffId", "dayOfWeek");
CREATE INDEX "StaffLeave_staffId_startAt_endAt_idx" ON "StaffLeave"("staffId", "startAt", "endAt");
CREATE INDEX "BusinessHoliday_businessId_startAt_idx" ON "BusinessHoliday"("businessId", "startAt");
CREATE INDEX "Appointment_businessId_staffId_startAt_idx" ON "Appointment"("businessId", "staffId", "startAt");
CREATE INDEX "Appointment_businessId_customerId_startAt_idx" ON "Appointment"("businessId", "customerId", "startAt" DESC);
CREATE INDEX "Appointment_businessId_locationId_startAt_idx" ON "Appointment"("businessId", "locationId", "startAt");
CREATE INDEX "Appointment_businessId_status_startAt_idx" ON "Appointment"("businessId", "status", "startAt");
CREATE INDEX "WaitlistEntry_businessId_serviceId_locationId_status_idx" ON "WaitlistEntry"("businessId", "serviceId", "locationId", "status");
CREATE INDEX "ReminderSchedule_status_scheduledAt_idx" ON "ReminderSchedule"("status", "scheduledAt");
CREATE INDEX "CalendarBlockedSlot_staffId_startAt_endAt_idx" ON "CalendarBlockedSlot"("staffId", "startAt", "endAt");
