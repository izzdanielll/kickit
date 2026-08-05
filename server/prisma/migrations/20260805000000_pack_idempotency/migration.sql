ALTER TABLE "pack_openings" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "pack_openings_ownerId_idempotencyKey_key" ON "pack_openings"("ownerId", "idempotencyKey");
