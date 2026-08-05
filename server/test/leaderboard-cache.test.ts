import { strict as assert } from 'node:assert';
import { LeaderboardCacheService } from '../src/gameweeks/leaderboard-cache.service';

async function main() {
  const sorted = new Map<string, Array<{ score: number; value: string }>>();
  const hashes = new Map<string, Record<string, string>>();
  const client: any = {
    isReady: true,
    multi() {
      const operations: Array<() => void> = [];
      const chain: any = {
        del(key: string) { operations.push(() => { sorted.delete(key); hashes.delete(key); }); return chain; },
        zAdd(key: string, values: Array<{ score: number; value: string }>) { operations.push(() => sorted.set(key, values)); return chain; },
        hSet(key: string, value: Record<string, string>) { operations.push(() => hashes.set(key, value)); return chain; },
        expire() { return chain; },
        async exec() { operations.forEach((operation) => operation()); },
      };
      return chain;
    },
    async exists(key: string) { return sorted.has(key) ? 1 : 0; },
    async zRangeWithScores(key: string, start: number, end: number) {
      return [...(sorted.get(key) ?? [])].sort((a, b) => b.score - a.score).slice(start, end + 1);
    },
    async hmGet(key: string, ids: string[]) { return ids.map((id) => hashes.get(key)?.[id] ?? null); },
  };
  const cache = new LeaderboardCacheService({ get: () => undefined } as any);
  (cache as any).client = client;
  await cache.rebuild('gw', 123, [
    { userId: 'early', totalScore: 20, rank: 1, user: { username: 'Early' } },
    { userId: 'late', totalScore: 20, rank: 1, user: { username: 'Late' } },
    { userId: 'third', totalScore: 10, rank: 3, user: { username: 'Third' } },
  ]);
  assert.deepEqual(await cache.page('gw', 123, 1, 3), [
    { userId: 'early', username: 'Early', totalScore: 20, rank: 1 },
    { userId: 'late', username: 'Late', totalScore: 20, rank: 1 },
    { userId: 'third', username: 'Third', totalScore: 10, rank: 3 },
  ]);
  assert.equal(await cache.page('gw', 124, 1, 3), null, 'a new database version must not read a stale cache generation');
  hashes.get('kickit:leaderboard:gw:123:users')!.early = 'corrupt';
  assert.equal(await cache.page('gw', 123, 1, 3), null, 'corrupt cache data must fall back to PostgreSQL');
  console.log('Leaderboard cache ordering and rank tests passed');
}

void main();
