import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GameweeksService } from './gameweeks.service';
import { SportsDataService } from './sports-data.service';
import { MetricsService } from '../common/observability/metrics.service';

@Injectable()
export class GameweekScheduler {
  private readonly logger = new Logger(GameweekScheduler.name);
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly gameweeks: GameweeksService, private readonly sports: SportsDataService, private readonly metrics: MetricsService) {}

  @Cron('0 * * * * *', { name: 'gameweek-state-machine', timeZone: 'UTC' })
  async tick() {
    if (this.running || !this.prisma.isDbConnected) return;
    this.running = true;
    try {
      const now = new Date();
      await this.gameweeks.ensureUpcoming(now);
      await this.gameweeks.openDue(now);
      await this.gameweeks.lockDue(now);
      for (const gameweek of await this.gameweeks.lockedEndingBefore(now)) {
        if (!(await this.gameweeks.claimSettlement(gameweek.id, new Date()))) continue;
        await this.sports.ingest(gameweek.id, gameweek.number);
        await this.gameweeks.settle(gameweek.id);
        this.metrics.increment('gameweek_settlements');
        this.metrics.setGauge('gameweek_last_settlement_timestamp_seconds', Math.floor(Date.now() / 1000));
      }
      this.metrics.setGauge('gameweek_scheduler_last_success_timestamp_seconds', Math.floor(Date.now() / 1000));
    } catch (error) {
      this.metrics.increment('gameweek_scheduler_failures');
      this.logger.error('Gameweek scheduler tick failed', error instanceof Error ? error.stack : String(error));
    } finally {
      this.running = false;
    }
  }
}
