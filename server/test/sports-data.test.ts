import { strict as assert } from 'node:assert';
import { SportsDataService } from '../src/gameweeks/sports-data.service';

async function main() {
  const required = [{ templateId: 'a' }, { templateId: 'b' }, { templateId: 'c' }, { templateId: 'd' }];
  let scored = 3;
  const prisma = {
    tournamentEntryCard: { findMany: async () => required },
    playerWeeklyScore: { count: async () => scored },
  };
  const config = { get: (_key: string, fallback: string) => fallback };
  const service = new SportsDataService(config as any, prisma as any);

  await assert.rejects(
    () => (service as any).assertCoverage('gameweek-1'),
    /coverage 75\.0% is below required 95%/,
  );

  scored = 4;
  await (service as any).assertCoverage('gameweek-1');
  console.log('Sports-data integrity tests passed');
}

void main();
