CREATE TABLE "AppointmentCalendarEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "businessId" UUID NOT NULL,
  "appointmentId" UUID NOT NULL,
  "connectionId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "externalEventId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentCalendarEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppointmentCalendarEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AppointmentCalendarEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AppointmentCalendarEvent_appointmentId_connectionId_key"
  ON "AppointmentCalendarEvent"("appointmentId", "connectionId");

CREATE INDEX "AppointmentCalendarEvent_businessId_appointmentId_idx"
  ON "AppointmentCalendarEvent"("businessId", "appointmentId");

CREATE INDEX "AppointmentCalendarEvent_connectionId_externalEventId_idx"
  ON "AppointmentCalendarEvent"("connectionId", "externalEventId");

INSERT INTO "AppointmentCalendarEvent" ("id", "businessId", "appointmentId", "connectionId", "provider", "externalEventId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), a."businessId", a."id", a."calendarConnectionId", c."provider", a."calendarEventId", NOW(), NOW()
FROM "Appointment" a
JOIN "CalendarConnection" c ON c."id" = a."calendarConnectionId"
WHERE a."calendarEventId" IS NOT NULL
  AND a."calendarConnectionId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "AppointmentCalendarEvent" e
    WHERE e."appointmentId" = a."id" AND e."connectionId" = a."calendarConnectionId"
  );
