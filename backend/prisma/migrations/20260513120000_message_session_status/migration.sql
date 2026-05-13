-- Message / session visibility (PRD)
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastInboundCustomerMessageAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "inboxUnreadCount" INTEGER NOT NULL DEFAULT 0;
