CREATE TYPE "EconomyTransactionReason" AS ENUM ('INITIAL_GRANT', 'PACK_PURCHASE', 'MARKETPLACE_PURCHASE', 'MARKETPLACE_SALE');

CREATE TABLE "economy_transactions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currency" "Currency" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "reason" "EconomyTransactionReason" NOT NULL,
  "referenceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "economy_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "economy_transactions_nonzero_amount_check" CHECK ("amount" <> 0),
  CONSTRAINT "economy_transactions_balance_range_check" CHECK ("balanceAfter" BETWEEN 0 AND 2000000000),
  CONSTRAINT "economy_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "economy_transactions_userId_reason_referenceId_key" ON "economy_transactions"("userId", "reason", "referenceId");
CREATE INDEX "economy_transactions_userId_createdAt_idx" ON "economy_transactions"("userId", "createdAt");
CREATE INDEX "economy_transactions_reason_referenceId_idx" ON "economy_transactions"("reason", "referenceId");

CREATE FUNCTION kickit_reject_economy_transaction_mutation() RETURNS trigger AS $$
BEGIN
  IF current_setting('kickit.allow_economy_ledger_mutation', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'economy_transactions is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER economy_transactions_append_only
BEFORE UPDATE OR DELETE ON "economy_transactions"
FOR EACH ROW EXECUTE FUNCTION kickit_reject_economy_transaction_mutation();
