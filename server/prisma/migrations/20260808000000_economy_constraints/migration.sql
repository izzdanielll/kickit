ALTER TABLE "users"
  ADD CONSTRAINT "users_coins_range_check" CHECK ("coins" BETWEEN 0 AND 2000000000),
  ADD CONSTRAINT "users_gems_range_check" CHECK ("gems" BETWEEN 0 AND 2000000000),
  ADD CONSTRAINT "users_xp_nonnegative_check" CHECK ("xp" >= 0),
  ADD CONSTRAINT "users_level_positive_check" CHECK ("level" BETWEEN 1 AND 1000);

ALTER TABLE "marketplace_listings"
  ADD CONSTRAINT "marketplace_price_range_check" CHECK ("price" BETWEEN 1 AND 1000000);

ALTER TABLE "pack_definitions"
  ADD CONSTRAINT "pack_card_count_range_check" CHECK ("cardCount" BETWEEN 1 AND 20),
  ADD CONSTRAINT "pack_coin_cost_range_check" CHECK ("coinCost" IS NULL OR "coinCost" BETWEEN 1 AND 1000000),
  ADD CONSTRAINT "pack_gem_cost_range_check" CHECK ("gemCost" IS NULL OR "gemCost" BETWEEN 1 AND 1000000);

ALTER TABLE "pack_openings"
  ADD CONSTRAINT "pack_opening_cost_range_check" CHECK ("cost" BETWEEN 1 AND 1000000);

ALTER TABLE "cards"
  ADD CONSTRAINT "cards_level_range_check" CHECK ("level" BETWEEN 1 AND 100),
  ADD CONSTRAINT "cards_xp_nonnegative_check" CHECK ("xp" >= 0);

ALTER TABLE "squad_cards"
  ADD CONSTRAINT "squad_cards_slot_range_check" CHECK ("slotIndex" BETWEEN 0 AND 6);

ALTER TABLE "tournament_entry_cards"
  ADD CONSTRAINT "tournament_multiplier_range_check" CHECK ("multiplierBps" BETWEEN 10000 AND 20000);
