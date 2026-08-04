import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class LeaderboardCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeaderboardCacheService.name);
  private client?: RedisClientType;
  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return;
    const client = createClient({ url, socket: { connectTimeout: 5000, reconnectStrategy: (retries) => Math.min(retries * 100, 3000) } });
    client.on('error', (error) => this.logger.error(`Redis error: ${error.message}`));
    try {
      await client.connect();
      this.client = client as RedisClientType;
      this.logger.log('Redis leaderboard cache connected');
    } catch (error) {
      if (this.config.get<string>('NODE_ENV') === 'production') throw error;
      this.logger.warn('Redis unavailable; leaderboard reads will use PostgreSQL');
    }
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) await this.client.quit();
  }

  async rebuild(gameweekId: string, entries: Array<{ userId: string; totalScore: number; user: { username: string } }>) {
    if (!this.client?.isReady) return;
    const scoreKey = this.scoreKey(gameweekId);
    const userKey = this.userKey(gameweekId);
    const multi = this.client.multi().del(scoreKey).del(userKey);
    if (entries.length) {
      multi.zAdd(scoreKey, entries.map((entry) => ({ score: entry.totalScore, value: entry.userId })));
      multi.hSet(userKey, Object.fromEntries(entries.map((entry) => [entry.userId, entry.user.username])));
    }
    multi.expire(scoreKey, 60 * 60 * 24 * 35).expire(userKey, 60 * 60 * 24 * 35);
    await multi.exec();
  }

  async page(gameweekId: string, page: number, limit: number) {
    if (!this.client?.isReady) return null;
    const key = this.scoreKey(gameweekId);
    if ((await this.client.exists(key)) === 0) return null;
    const start = (page - 1) * limit;
    const rows = await this.client.zRangeWithScores(key, start, start + limit - 1, { REV: true });
    const usernames = rows.length ? await this.client.hmGet(this.userKey(gameweekId), rows.map((row) => row.value)) : [];
    return rows.map((row, index) => ({ rank: start + index + 1, userId: row.value, username: usernames[index] ?? 'Unknown', totalScore: row.score }));
  }

  private scoreKey(id: string) { return `kickit:leaderboard:${id}:scores`; }
  private userKey(id: string) { return `kickit:leaderboard:${id}:users`; }
}
