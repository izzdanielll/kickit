import { strict as assert } from 'node:assert';
import { PacksService } from '../src/packs/packs.service';
import { INITIAL_PACKS, INITIAL_TEMPLATES } from '../src/prisma/prisma.service';

async function main() {
  const user = { id: 'user-1', coins: 1_000, gems: 1_000 };
  const users = new Map<string, any>([[user.id, user]]);
  const cards = new Map<string, any>();
  const fakePrisma = {
    isDbConnected: false,
    memStore: {
      users,
      cards,
      packs: INITIAL_PACKS,
      templates: INITIAL_TEMPLATES,
      packOpenings: new Map<string, any>(),
    },
  };
  const service = new PacksService(fakePrisma as any);
  const idempotencyKey = '68aee6c1-650d-4f5e-a17b-a9caffd3746a';

  const first = await service.openPack(user.id, 'pack_bronze', idempotencyKey);
  const balanceAfterFirst = user.coins;
  const second = await service.openPack(user.id, 'pack_bronze', idempotencyKey);

  assert.equal(first.packOpeningId, second.packOpeningId);
  assert.deepEqual(first.cards.map((card) => card.id), second.cards.map((card) => card.id));
  assert.equal(user.coins, balanceAfterFirst, 'an idempotent replay must not debit the user twice');
  assert.equal(cards.size, 5, 'an idempotent replay must not create duplicate cards');
  assert.equal(new Set(first.cards.map((card) => card.id)).size, 5, 'cryptographic card IDs must be unique');

  await service.openPack(user.id, 'pack_bronze', '0a5381a8-e1a4-4866-81bc-e52be51a72bc');
  assert.equal(user.coins, balanceAfterFirst - 250, 'a new request must purchase a new pack');
  assert.equal(cards.size, 10);
  console.log('Pack security tests passed');
}

void main();
