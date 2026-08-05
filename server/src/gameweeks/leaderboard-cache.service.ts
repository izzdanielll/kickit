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
    const client = createClient({
      url,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => retries >= 3 ? false : Math.min((retries + 1) * 250, 1000),
      },
    });
    client.on('error', (error) => this.logger.error(`Redis error: ${error.message}`));
    try {
      await client.connect();
      this.client = client as RedisClientType;
      this.logger.log('Redis leaderboard cache connected');
    } catch (error) {
      await client.disconnect().catch(() => undefined);
      if (this.config.get<string>('NODE_ENV') === 'production') throw error;
      this.logger.warn('Redis unavailable; leaderboard reads will use PostgreSQL');
    }
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) await this.client.quit();
  }

  async rebuild(gameweekId: string, version: number, entries: Array<{ userId: string; totalScore: number; rank: number; user: { username: string } }>) {
    if (!this.client?.isReady) return;
    const scoreKey = this.scoreKey(gameweekId, version);
    const userKey = this.userKey(gameweekId, version);
    const multi = this.client.multi().del(scoreKey).del(userKey);
    if (entries.length) {
      // Entries arrive in the authoritative score/createdAt order. An ordinal ZSET
      // score preserves that exact order while the hash retains score and tied rank.
      multi.zAdd(scoreKey, entries.map((entry, index) => ({ score: entries.length - index, value: entry.userId })));
      multi.hSet(userKey, Object.fromEntries(entries.map((entry) => [entry.userId, JSON.stringify({ username: entry.user.username, totalScore: entry.totalScore, rank: entry.rank })])));
    }
    multi.expire(scoreKey, 60 * 60 * 24 * 35).expire(userKey, 60 * 60 * 24 * 35);
    await multi.exec();
  }

  async page(gameweekId: string, version: number, page: number, limit: number) {
    if (!this.client?.isReady) return null;
    const key = this.scoreKey(gameweekId, version);
    if ((await this.client.exists(key)) === 0) return null;
    const start = (page - 1) * limit;
    const rows = await this.client.zRangeWithScores(key, start, start + limit - 1, { REV: true });
    const metadata = rows.length ? await this.client.hmGet(this.userKey(gameweekId, version), rows.map((row) => row.value)) : [];
    try {
      if (metadata.some((value) => !value)) return null;
      return rows.map((row, index) => {
        const value = JSON.parse(metadata[index]!) as { username: string; totalScore: number; rank: number };
        if (typeof value.username !== 'string' || !Number.isFinite(value.totalScore) || !Number.isInteger(value.rank)) throw new Error('Invalid cached leaderboard metadata');
        return { rank: value.rank, userId: row.value, username: value.username, totalScore: value.totalScore };
      });
    } catch {
      return null;
    }
  }

  readiness() {
    const required = this.config.get<string>('NODE_ENV') === 'production';
    return { required, ready: this.client?.isReady === true };
  }

  private scoreKey(id: string, version: number) { return `kickit:leaderboard:${id}:${version}:scores`; }
  private userKey(id: string, version: number) { return `kickit:leaderboard:${id}:${version}:users`; }
}
