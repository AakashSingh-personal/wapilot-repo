-- Phase 5: Row-level security for scheduling tables (defense in depth).
-- Enable with SCHEDULING_RLS_ENABLED=1 and set app.business_id per request via tenantContext.
-- Policies use NULL business_id bypass for migrations/admin (superuser bypasses RLS).

CREATE OR REPLACE FUNCTION app_current_business_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.business_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  tbl text;
  tables_with_business text[] := ARRAY[
    'Location',
    'StaffMember',
    'ServiceCategory',
    'ScheduledService',
    'StaffWorkingHours',
    'StaffLeave',
    'BusinessHoliday',
    'Appointment',
    'CustomerAppointmentStats',
    'WaitlistEntry',
    'AppointmentPayment',
    'ReminderSchedule',
    'BookingIdempotencyKey',
    'AppointmentRating',
    'AiBookingSession',
    'CalendarConnection',
    'AppointmentCalendarEvent',
    'CalendarBlockedSlot',
    'StaffAvailabilityRule'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_with_business LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL USING (
        app_current_business_id() IS NULL OR "businessId" = app_current_business_id()
      ) WITH CHECK (
        app_current_business_id() IS NULL OR "businessId" = app_current_business_id()
      )',
      tbl
    );
  END LOOP;
END $$;

-- Junction / child tables without direct businessId
ALTER TABLE "StaffLocation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StaffLocation";
CREATE POLICY tenant_isolation ON "StaffLocation" FOR ALL USING (
  app_current_business_id() IS NULL OR EXISTS (
    SELECT 1 FROM "StaffMember" s WHERE s.id = "staffId" AND s."businessId" = app_current_business_id()
  )
);

ALTER TABLE "StaffService" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StaffService";
CREATE POLICY tenant_isolation ON "StaffService" FOR ALL USING (
  app_current_business_id() IS NULL OR EXISTS (
    SELECT 1 FROM "StaffMember" s WHERE s.id = "staffId" AND s."businessId" = app_current_business_id()
  )
);

ALTER TABLE "StaffBreak" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StaffBreak";
CREATE POLICY tenant_isolation ON "StaffBreak" FOR ALL USING (
  app_current_business_id() IS NULL OR EXISTS (
    SELECT 1 FROM "StaffMember" s WHERE s.id = "staffId" AND s."businessId" = app_current_business_id()
  )
);

ALTER TABLE "AppointmentStatusHistory" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AppointmentStatusHistory";
CREATE POLICY tenant_isolation ON "AppointmentStatusHistory" FOR ALL USING (
  app_current_business_id() IS NULL OR EXISTS (
    SELECT 1 FROM "Appointment" a WHERE a.id = "appointmentId" AND a."businessId" = app_current_business_id()
  )
);
