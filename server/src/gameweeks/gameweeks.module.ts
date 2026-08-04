import { Module } from '@nestjs/common';
import { GameweeksController } from './gameweeks.controller';
import { GameweeksService } from './gameweeks.service';
import { GameweekScheduler } from './gameweek.scheduler';
import { SportsDataService } from './sports-data.service';
import { LeaderboardCacheService } from './leaderboard-cache.service';

@Module({
  controllers: [GameweeksController],
  providers: [GameweeksService, GameweekScheduler, SportsDataService, LeaderboardCacheService],
  exports: [GameweeksService],
})
export class GameweeksModule {}
