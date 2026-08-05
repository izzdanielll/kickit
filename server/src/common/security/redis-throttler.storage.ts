import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { createClient, RedisClientType } from 'redis';

const INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  return { hits, redis.call('PTTL', KEYS[1]), 1, blockTtl }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, ttl, 1, tonumber(ARGV[3]) }
end
return { hits, ttl, 0, 0 }
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly fallback = new ThrottlerStorageService();
  private client?: RedisClientType;
  private connecting?: Promise<void>;

  constructor(redisUrl: string | undefined, private readonly production: boolean) {
    if (redisUrl) {
      this.client = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 2000,
          reconnectStrategy: (retries) => retries >= 1 ? false : 250,
        },
      }) as RedisClientType;
      // The operation path handles failures; an error listener prevents unhandled events.
      this.client.on('error', () => undefined);
    }
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    if (!this.client) return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    try {
      await this.connect();
      const safeKey = Buffer.from(`${throttlerName}:${key}`).toString('base64url');
      const result = await this.client.eval(INCREMENT_SCRIPT, {
        keys: [`kickit:throttle:${safeKey}:hits`, `kickit:throttle:${safeKey}:blocked`],
        arguments: [String(ttl), String(limit), String(blockDuration || ttl)],
      }) as number[];
      return {
        totalHits: Number(result[0]),
        timeToExpire: Math.max(0, Math.ceil(Number(result[1]) / 1000)),
        isBlocked: Number(result[2]) === 1,
        timeToBlockExpire: Math.max(0, Math.ceil(Number(result[3]) / 1000)),
      };
    } catch (error) {
      await this.client?.disconnect().catch(() => undefined);
      if (this.production) throw error;
      this.client = undefined;
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  private async connect() {
    if (!this.client || this.client.isReady) return;
    if (!this.connecting) {
      this.connecting = this.client.connect().then(() => undefined).finally(() => { this.connecting = undefined; });
    }
    await this.connecting;
  }
}
