-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'ICON');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GK', 'DEF', 'MID', 'FWD');

-- CreateEnum
CREATE TYPE "PackType" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PROMO');

-- CreateEnum
CREATE TYPE "MatchResult" AS ENUM ('WIN', 'LOSS', 'DRAW');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 500,
    "gems" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_templates" (
    "id" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "club" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "baseAttack" INTEGER NOT NULL,
    "baseDefense" INTEGER NOT NULL,
    "basePace" INTEGER NOT NULL,
    "basePassing" INTEGER NOT NULL,
    "basePhysical" INTEGER NOT NULL,
    "specialTrait" TEXT,
    "imageUrl" TEXT,
    "season" TEXT NOT NULL DEFAULT '2024-25',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "bonusAttack" INTEGER NOT NULL DEFAULT 0,
    "bonusDefense" INTEGER NOT NULL DEFAULT 0,
    "bonusPace" INTEGER NOT NULL DEFAULT 0,
    "bonusPassing" INTEGER NOT NULL DEFAULT 0,
    "bonusPhysical" INTEGER NOT NULL DEFAULT 0,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "squads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "formation" TEXT NOT NULL DEFAULT '4-3-3',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "squads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "squad_cards" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,

    CONSTRAINT "squad_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "homeUserId" TEXT NOT NULL,
    "awayUserId" TEXT NOT NULL,
    "homeSquadId" TEXT NOT NULL,
    "awaySquadId" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "result" "MatchResult",
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "matchLog" JSONB,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "squad_cards_squadId_slotIndex_key" ON "squad_cards"("squadId", "slotIndex");

-- CreateIndex
CREATE UNIQUE INDEX "squad_cards_squadId_cardId_key" ON "squad_cards"("squadId", "cardId");

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "card_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squads" ADD CONSTRAINT "squads_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad_cards" ADD CONSTRAINT "squad_cards_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad_cards" ADD CONSTRAINT "squad_cards_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_homeUserId_fkey" FOREIGN KEY ("homeUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_awayUserId_fkey" FOREIGN KEY ("awayUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_homeSquadId_fkey" FOREIGN KEY ("homeSquadId") REFERENCES "squads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_awaySquadId_fkey" FOREIGN KEY ("awaySquadId") REFERENCES "squads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
