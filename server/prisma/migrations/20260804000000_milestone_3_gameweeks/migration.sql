CREATE TYPE "GameweekStatus" AS ENUM ('UPCOMING', 'OPEN', 'LOCKED', 'SETTLING', 'COMPLETED');

ALTER TABLE "card_templates" ADD COLUMN "realWorldPlayerId" INTEGER;
CREATE UNIQUE INDEX "card_templates_realWorldPlayerId_key" ON "card_templates"("realWorldPlayerId");

CREATE TABLE "gameweeks" (
  "id" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "status" "GameweekStatus" NOT NULL DEFAULT 'UPCOMING',
  "startTime" TIMESTAMP(3) NOT NULL,
  "lockTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "settledAt" TIMESTAMP(3),
  "processingStartedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gameweeks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_weekly_scores" (
  "id" TEXT NOT NULL,
  "gameweekId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "minutesPlayed" INTEGER NOT NULL DEFAULT 0,
  "goals" INTEGER NOT NULL DEFAULT 0,
  "assists" INTEGER NOT NULL DEFAULT 0,
  "yellowCards" INTEGER NOT NULL DEFAULT 0,
  "redCards" INTEGER NOT NULL DEFAULT 0,
  "ownGoals" INTEGER NOT NULL DEFAULT 0,
  "penaltyMisses" INTEGER NOT NULL DEFAULT 0,
  "cleanSheet" BOOLEAN NOT NULL DEFAULT false,
  "saves" INTEGER NOT NULL DEFAULT 0,
  "penaltySaves" INTEGER NOT NULL DEFAULT 0,
  "totalPoints" INTEGER NOT NULL DEFAULT 0,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "player_weekly_scores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tournament_entries" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "squadId" TEXT NOT NULL,
  "gameweekId" TEXT NOT NULL,
  "totalScore" INTEGER NOT NULL DEFAULT 0,
  "rank" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tournament_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tournament_entry_cards" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "slotIndex" INTEGER NOT NULL,
  "multiplierBps" INTEGER NOT NULL,
  CONSTRAINT "tournament_entry_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gameweeks_number_key" ON "gameweeks"("number");
CREATE INDEX "gameweeks_status_startTime_idx" ON "gameweeks"("status", "startTime");
CREATE INDEX "gameweeks_status_lockTime_idx" ON "gameweeks"("status", "lockTime");
CREATE INDEX "gameweeks_status_endTime_idx" ON "gameweeks"("status", "endTime");
CREATE UNIQUE INDEX "player_weekly_scores_gameweekId_templateId_key" ON "player_weekly_scores"("gameweekId", "templateId");
CREATE INDEX "player_weekly_scores_gameweekId_totalPoints_idx" ON "player_weekly_scores"("gameweekId", "totalPoints");
CREATE UNIQUE INDEX "tournament_entries_userId_gameweekId_key" ON "tournament_entries"("userId", "gameweekId");
CREATE INDEX "tournament_entries_gameweekId_totalScore_idx" ON "tournament_entries"("gameweekId", "totalScore");
CREATE UNIQUE INDEX "tournament_entry_cards_entryId_slotIndex_key" ON "tournament_entry_cards"("entryId", "slotIndex");
CREATE INDEX "tournament_entry_cards_templateId_idx" ON "tournament_entry_cards"("templateId");
CREATE INDEX "marketplace_listings_cardId_status_idx" ON "marketplace_listings"("cardId", "status");
CREATE UNIQUE INDEX "marketplace_one_active_listing_per_card" ON "marketplace_listings"("cardId") WHERE "status" = 'ACTIVE';

ALTER TABLE "player_weekly_scores" ADD CONSTRAINT "player_weekly_scores_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "gameweeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_weekly_scores" ADD CONSTRAINT "player_weekly_scores_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "card_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "squads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "gameweeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournament_entry_cards" ADD CONSTRAINT "tournament_entry_cards_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "tournament_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournament_entry_cards" ADD CONSTRAINT "tournament_entry_cards_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "card_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
