-- CreateIndex
CREATE INDEX "cards_ownerId_acquiredAt_idx" ON "cards"("ownerId", "acquiredAt");

-- CreateIndex
CREATE INDEX "cards_templateId_idx" ON "cards"("templateId");

-- CreateIndex
CREATE INDEX "matches_homeUserId_playedAt_idx" ON "matches"("homeUserId", "playedAt");

-- CreateIndex
CREATE INDEX "matches_awayUserId_playedAt_idx" ON "matches"("awayUserId", "playedAt");

-- CreateIndex
CREATE INDEX "squads_ownerId_isActive_idx" ON "squads"("ownerId", "isActive");
