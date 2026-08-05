ALTER TABLE "economy_transactions" DROP CONSTRAINT "economy_transactions_nonzero_amount_check";
ALTER TABLE "economy_transactions" ADD CONSTRAINT "economy_transactions_amount_check"
  CHECK ("amount" <> 0 OR "reason" = 'INITIAL_GRANT');

-- Establish an opening checkpoint only for accounts that predate the ledger.
-- Accounts already carrying any ledger history must never be backfilled again.
WITH unledgered AS (
  SELECT u."id", u."coins", u."gems"
  FROM "users" u
  WHERE NOT EXISTS (SELECT 1 FROM "economy_transactions" e WHERE e."userId" = u."id")
)
INSERT INTO "economy_transactions" ("id", "userId", "currency", "amount", "balanceAfter", "reason", "referenceId")
SELECT gen_random_uuid()::text, "id", 'COINS'::"Currency", "coins", "coins", 'INITIAL_GRANT'::"EconomyTransactionReason", 'ledger-backfill:COINS'
FROM unledgered
UNION ALL
SELECT gen_random_uuid()::text, "id", 'GEMS'::"Currency", "gems", "gems", 'INITIAL_GRANT'::"EconomyTransactionReason", 'ledger-backfill:GEMS'
FROM unledgered;
