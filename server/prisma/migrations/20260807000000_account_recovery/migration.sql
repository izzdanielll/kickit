CREATE TYPE "AccountTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
UPDATE "users" SET "emailVerifiedAt" = CURRENT_TIMESTAMP;

CREATE TABLE "account_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AccountTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "account_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "account_tokens_tokenHash_key" ON "account_tokens"("tokenHash");
CREATE INDEX "account_tokens_userId_type_consumedAt_idx" ON "account_tokens"("userId", "type", "consumedAt");
CREATE INDEX "account_tokens_expiresAt_idx" ON "account_tokens"("expiresAt");
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
