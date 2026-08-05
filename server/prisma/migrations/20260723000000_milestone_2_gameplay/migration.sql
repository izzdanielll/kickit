-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('COINS', 'GEMS');
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- Align card rarity with the game design document.
BEGIN;
CREATE TYPE "Rarity_new" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC');
ALTER TABLE "card_templates" ALTER COLUMN "rarity" TYPE "Rarity_new" USING ("rarity"::text::"Rarity_new");
ALTER TYPE "Rarity" RENAME TO "Rarity_old";
ALTER TYPE "Rarity_new" RENAME TO "Rarity";
DROP TYPE "Rarity_old";
COMMIT;

ALTER TABLE "cards" ADD COLUMN "packOpeningId" TEXT;
ALTER TABLE "squads" ALTER COLUMN "formation" SET DEFAULT '1-2-1';

CREATE TABLE "pack_definitions" (
  "id" TEXT NOT NULL,
  "type" "PackType" NOT NULL,
  "name" TEXT NOT NULL,
  "coinCost" INTEGER,
  "gemCost" INTEGER,
  "cardCount" INTEGER NOT NULL DEFAULT 5,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pack_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pack_openings" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "packId" TEXT NOT NULL,
  "currency" "Currency" NOT NULL,
  "cost" INTEGER NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pack_openings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketplace_listings" (
  "id" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "buyerId" TEXT,
  "price" INTEGER NOT NULL,
  "currency" "Currency" NOT NULL,
  "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pack_definitions_type_key" ON "pack_definitions"("type");
CREATE INDEX "pack_openings_ownerId_openedAt_idx" ON "pack_openings"("ownerId", "openedAt");
CREATE INDEX "marketplace_listings_status_createdAt_idx" ON "marketplace_listings"("status", "createdAt");
CREATE INDEX "marketplace_listings_sellerId_status_idx" ON "marketplace_listings"("sellerId", "status");
CREATE UNIQUE INDEX "card_templates_playerName_season_key" ON "card_templates"("playerName", "season");

ALTER TABLE "cards" ADD CONSTRAINT "cards_packOpeningId_fkey" FOREIGN KEY ("packOpeningId") REFERENCES "pack_openings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pack_openings" ADD CONSTRAINT "pack_openings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pack_openings" ADD CONSTRAINT "pack_openings_packId_fkey" FOREIGN KEY ("packId") REFERENCES "pack_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
