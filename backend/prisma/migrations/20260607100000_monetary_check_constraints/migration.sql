-- Prevent negative wallet balances and payment amounts at the database level.

ALTER TABLE "Wallet"
  ADD CONSTRAINT "wallet_balance_non_negative" CHECK (balance >= 0);

ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "wallet_txn_amount_positive" CHECK (amount > 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "payment_amount_positive" CHECK (amount > 0);

ALTER TABLE "CustomerPayment"
  ADD CONSTRAINT "customer_payment_amount_positive" CHECK (amount > 0);
