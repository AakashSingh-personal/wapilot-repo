-- Composite indexes for inbox, threads, and dashboard queries
CREATE INDEX IF NOT EXISTS "Customer_businessId_lastInboundCustomerMessageAt_idx"
  ON "Customer"("businessId", "lastInboundCustomerMessageAt" DESC);

CREATE INDEX IF NOT EXISTS "Lead_businessId_createdAt_idx"
  ON "Lead"("businessId", "createdAt");

CREATE INDEX IF NOT EXISTS "Message_businessId_customerId_createdAt_idx"
  ON "Message"("businessId", "customerId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Message_businessId_customerId_type_createdAt_idx"
  ON "Message"("businessId", "customerId", "type", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Message_businessId_type_createdAt_idx"
  ON "Message"("businessId", "type", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Booking_businessId_customerId_createdAt_idx"
  ON "Booking"("businessId", "customerId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "CustomerPayment_businessId_customerId_status_idx"
  ON "CustomerPayment"("businessId", "customerId", "status");

CREATE INDEX IF NOT EXISTS "CustomerPayment_providerLinkId_idx"
  ON "CustomerPayment"("providerLinkId");

CREATE INDEX IF NOT EXISTS "WalletTransaction_businessId_createdAt_idx"
  ON "WalletTransaction"("businessId", "createdAt" DESC);
