import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../common/observability/metrics.service';

@Injectable()
export class SecurityMaintenanceService {
  private readonly logger = new Logger(SecurityMaintenanceService.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly metrics: MetricsService) {}

  @Cron('0 15 2 * * *', { name: 'security-data-retention', timeZone: 'UTC' })
  async scheduledCleanup() {
    try {
      const result = await this.run();
      this.logger.log(JSON.stringify({ event: 'security_retention_cleanup', ...result }));
    } catch (error) {
      this.metrics.increment('security_maintenance_failures');
      this.logger.error('Security retention cleanup failed', error instanceof Error ? error.stack : String(error));
    }
  }

  async run(now = new Date()) {
    const tokenDays = Number(this.config.get<string>('ACCOUNT_TOKEN_RETENTION_DAYS', '7'));
    const eventDays = Number(this.config.get<string>('SECURITY_EVENT_RETENTION_DAYS', '90'));
    const tokenCutoff = new Date(now.getTime() - tokenDays * 86_400_000);
    const eventCutoff = new Date(now.getTime() - eventDays * 86_400_000);

    if (!this.prisma.isDbConnected) {
      let sessions = 0;
      let tokens = 0;
      for (const [id, session] of this.prisma.memStore.sessions) {
        if (session.expiresAt <= now) { this.prisma.memStore.sessions.delete(id); sessions += 1; }
      }
      for (const [hash, token] of this.prisma.memStore.accountTokens) {
        if (token.expiresAt <= tokenCutoff || (token.consumedAt && token.consumedAt <= tokenCutoff)) {
          this.prisma.memStore.accountTokens.delete(hash); tokens += 1;
        }
      }
      const before = this.prisma.memStore.securityEvents.length;
      this.prisma.memStore.securityEvents = this.prisma.memStore.securityEvents.filter((event: any) => event.createdAt > eventCutoff);
      return { sessions, tokens, securityEvents: before - this.prisma.memStore.securityEvents.length };
    }

    const [sessions, tokens, securityEvents] = await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { expiresAt: { lte: now } } }),
      this.prisma.accountToken.deleteMany({ where: { OR: [{ expiresAt: { lte: tokenCutoff } }, { consumedAt: { lte: tokenCutoff } }] } }),
      this.prisma.securityEvent.deleteMany({ where: { createdAt: { lte: eventCutoff } } }),
    ]);
    return { sessions: sessions.count, tokens: tokens.count, securityEvents: securityEvents.count };
  }
}
