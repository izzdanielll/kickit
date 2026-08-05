import { Controller, Get, Header, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { LeaderboardCacheService } from './gameweeks/leaderboard-cache.service';
import { PrismaService } from './prisma/prisma.service';
import { MetricsService } from './common/observability/metrics.service';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
    private readonly leaderboardCache: LeaderboardCacheService,
  ) {}

  @Get()
  getHealth() {
    return {
      status: 'online',
      app: 'kickIt API',
      version: '1.0.0',
      message: 'Backend API server is up and running healthy! ⚽',
    };
  }

  @Get('health/live')
  @SkipThrottle()
  getLiveness() {
    return { status: 'ok' };
  }

  @Get('health/ready')
  @SkipThrottle()
  async getReadiness() {
    if (!this.prisma.isDbConnected) throw new ServiceUnavailableException('Database is not ready');
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database is not ready');
    }
    const redis = this.leaderboardCache.readiness();
    if (redis.required && !redis.ready) throw new ServiceUnavailableException('Redis is not ready');
    return { status: 'ready', database: 'ok', redis: redis.ready ? 'ok' : 'optional-unavailable' };
  }

  @Get('metrics')
  @SkipThrottle()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(@Req() request: Request) {
    const expected = this.config.get<string>('METRICS_TOKEN');
    if (expected && !this.matchesSecret(request.get('authorization') ?? '', `Bearer ${expected}`)) throw new UnauthorizedException();
    return this.metrics.render();
  }

  private matchesSecret(actual: string, expected: string) {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
