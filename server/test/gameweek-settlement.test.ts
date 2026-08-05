import { strict as assert } from 'node:assert';
import { GameweeksService } from '../src/gameweeks/gameweeks.service';

async function main() {
  const updates: Array<{ id: string; totalScore: number; rank: number }> = [];
  let cached: any[] | undefined;
  const entries = [
    { id: 'first', userId: 'u1', createdAt: new Date('2026-01-01T00:00:00Z'), user: { username: 'First' }, cards: [{ multiplierBps: 10000, template: { weeklyScores: [{ totalPoints: 10 }] } }] },
    { id: 'second', userId: 'u2', createdAt: new Date('2026-01-01T00:01:00Z'), user: { username: 'Second' }, cards: [{ multiplierBps: 10000, template: { weeklyScores: [{ totalPoints: 10 }] } }] },
    { id: 'third', userId: 'u3', createdAt: new Date('2026-01-01T00:02:00Z'), user: { username: 'Third' }, cards: [{ multiplierBps: 10000, template: { weeklyScores: [{ totalPoints: 5 }] } }] },
  ];
  const tx = {
    gameweek: { updateMany: async () => ({ count: 1 }) },
    tournamentEntry: {
      findMany: async () => entries,
      update: async ({ where, data }: any) => { updates.push({ id: where.id, totalScore: data.totalScore, rank: data.rank }); },
    },
  };
  const prisma = {
    $transaction: async (operation: any) => operation(tx),
    gameweek: { findUniqueOrThrow: async () => ({ updatedAt: new Date(123) }) },
  };
  const cache = { rebuild: async (_id: string, version: number, value: any[]) => { assert.equal(version, 123); cached = value; } };
  const service = new GameweeksService(prisma as any, cache as any);
  await service.settle('gw');
  assert.deepEqual(updates, [
    { id: 'first', totalScore: 10, rank: 1 },
    { id: 'second', totalScore: 10, rank: 1 },
    { id: 'third', totalScore: 5, rank: 3 },
  ]);
  assert.deepEqual(cached?.map((entry) => [entry.userId, entry.totalScore, entry.rank]), [
    ['u1', 10, 1], ['u2', 10, 1], ['u3', 5, 3],
  ]);
  console.log('Gameweek settlement ranking tests passed');
}

void main();
