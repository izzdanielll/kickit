import assert from 'node:assert/strict';
import test from 'node:test';
import { cardOverall, formatCountdown, marketplaceParams } from '../src/lib/dashboard-utils.ts';

test('card overall includes the card level bonus', () => {
  const card = {
    level: 3,
    template: { baseAttack: 80, baseDefense: 70, basePace: 90, basePassing: 85, basePhysical: 75 },
  };
  assert.equal(cardOverall(card), 82);
});

test('countdown is stable at and after the deadline', () => {
  assert.equal(formatCountdown('2026-08-16T12:00:00Z', Date.parse('2026-08-15T10:30:00Z')), '1d 1h 30m');
  assert.equal(formatCountdown('2026-08-16T12:00:00Z', Date.parse('2026-08-16T12:00:01Z')), 'due now');
});

test('marketplace parameters omit inactive filters', () => {
  const params = marketplaceParams({ page: 2, search: ' Silva ', club: ' United ', position: 'MID', rarity: 'ALL', currency: 'COINS', sort: 'price_asc', minPrice: '50', maxPrice: '' });
  assert.equal(params.toString(), 'page=2&limit=24&sort=price_asc&search=Silva&club=United&position=MID&currency=COINS&minPrice=50');
});
