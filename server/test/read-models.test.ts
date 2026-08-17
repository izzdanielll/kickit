import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { GameweeksService } from '../src/gameweeks/gameweeks.service';
import { MarketplaceService } from '../src/marketplace/marketplace.service';
import { SquadsService } from '../src/squads/squads.service';
import { MarketplaceQueryDto } from '../src/marketplace/dto/marketplace.dto';

async function gameweekReadModels() {
  const completed = { id: 'gw1', number: 1, status: 'COMPLETED', entries: [{ totalScore: 21, rank: 2 }] };
  const prisma = {
    isDbConnected: true,
    gameweek: { findMany: async () => [completed] },
    tournamentEntry: {
      findUnique: async () => ({
        id: 'entry', totalScore: 21, rank: 2,
        cards: [{ slotIndex: 0, multiplierBps: 12_500, template: { playerName: 'Keeper', position: 'GK', rarity: 'RARE', weeklyScores: [{ totalPoints: 8 }] } }],
      }),
    },
  };
  const service = new GameweeksService(prisma as any, {} as any);
  const history = await service.history('user', 1, 5);
  assert.equal(history[0].entry?.rank, 2);
  assert.equal((history[0] as any).entries, undefined, 'private relation wrapper must not leak');
  const details = await service.entryDetails('user', 'gw1');
  assert.equal(details?.cards[0].multiplier, 1.25);
  assert.equal(details?.cards[0].totalPoints, 10);
}

async function marketplaceFiltering() {
  const template = (playerName: string, rarity: string, club: string) => ({ playerName, rarity, club, position: 'MID' });
  const listings = new Map([
    ['one', { id: 'one', sellerId: 's1', status: 'ACTIVE', currency: 'COINS', price: 100, card: { template: template('Alpha', 'COMMON', 'North') } }],
    ['two', { id: 'two', sellerId: 's2', status: 'ACTIVE', currency: 'COINS', price: 500, card: { template: template('Beta', 'MYTHIC', 'South') } }],
    ['three', { id: 'three', sellerId: 's3', buyerId: 'buyer', status: 'COMPLETED', currency: 'GEMS', price: 20, card: { template: template('Gamma', 'RARE', 'West') } }],
  ]);
  const service = new MarketplaceService({ isDbConnected: false, memStore: { listings } } as any);
  const query = Object.assign(new MarketplaceQueryDto(), { page: 1, limit: 20, club: 'south', minPrice: 300, maxPrice: 600 });
  const result = await service.getListings('buyer', query);
  assert.deepEqual(result.map((listing: any) => listing.id), ['two']);
  assert.deepEqual((await service.getMyPurchases('buyer')).map((listing: any) => listing.id), ['three']);
  await assert.rejects(
    () => service.getListings('buyer', Object.assign(new MarketplaceQueryDto(), { page: 1, limit: 20, minPrice: 900, maxPrice: 100 })),
    BadRequestException,
  );
}

async function squadCapEnforcement() {
  const positions = ['GK', 'DEF', 'MID', 'MID', 'FWD'];
  const cards = new Map(positions.map((position, index) => [`c${index}`, {
    id: `c${index}`, ownerId: 'user', isLocked: false, level: 1,
    template: { position, baseAttack: 99, baseDefense: 99, basePace: 99, basePassing: 99, basePhysical: 99 },
  }]));
  const service = new SquadsService({ isDbConnected: false, memStore: { cards, squads: new Map() } } as any);
  await assert.rejects(
    () => service.saveSquad('user', { formation: '1-2-1', slots: positions.map((_, slotIndex) => ({ slotIndex, cardId: `c${slotIndex}` })) }),
    (error: any) => error instanceof BadRequestException && error.message.includes('85 cap'),
  );
}

async function main() {
  await gameweekReadModels();
  await marketplaceFiltering();
  await squadCapEnforcement();
  console.log('Dashboard read model and validation tests passed');
}

void main();
