-- Add webhookToken to CalendarConnection.
-- This token is generated at push-channel registration time and verified on
-- every inbound Google Calendar push notification (X-Goog-Channel-Token header).

ALTER TABLE "CalendarConnection"
  ADD COLUMN "webhookToken" TEXT;
