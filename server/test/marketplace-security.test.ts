import { strict as assert } from 'node:assert';
import { MarketplaceService } from '../src/marketplace/marketplace.service';

async function main() {
  const seller = { id: 'seller', username: 'Seller', coins: 100, gems: 0 };
  const buyer = { id: 'buyer', username: 'Buyer', coins: 1_000, gems: 0 };
  const other = { id: 'other', username: 'Other', coins: 1_000, gems: 0 };
  const card = { id: 'card-1', ownerId: seller.id, isLocked: true, template: { playerName: 'Player', position: 'FWD', rarity: 'RARE' } };
  const listing = { id: 'listing-1', cardId: card.id, sellerId: seller.id, price: 400, currency: 'COINS', status: 'ACTIVE', card };
  const prisma = {
    isDbConnected: false,
    memStore: {
      users: new Map([[seller.id, seller], [buyer.id, buyer], [other.id, other]]),
      cards: new Map([[card.id, card]]),
      listings: new Map([[listing.id, listing]]),
      squads: new Map(),
    },
  };
  const service = new MarketplaceService(prisma as any);

  await assert.rejects(() => service.cancelListing(other.id, listing.id), /only cancel your own/);
  await assert.rejects(() => service.buyListing(seller.id, listing.id), /own listing/);
  assert.equal(listing.status, 'ACTIVE');
  assert.equal(card.ownerId, seller.id);

  const startTotal = seller.coins + buyer.coins;
  const attempts = await Promise.allSettled([
    service.buyListing(buyer.id, listing.id),
    service.buyListing(other.id, listing.id),
  ]);
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1, 'only one buyer may claim a listing');
  assert.equal(listing.status, 'COMPLETED');
  assert.equal(card.ownerId, buyer.id);
  assert.equal(card.isLocked, false);
  assert.equal(buyer.coins, 600);
  assert.equal(seller.coins, 480);
  assert.equal(startTotal - (seller.coins + buyer.coins), 20, 'exactly the configured 5% market fee must leave circulation');

  await assert.rejects(() => service.cancelListing(seller.id, listing.id), /not active|no longer active/i);

  seller.coins = 2_000_000_000;
  const secondCard = { ...card, id: 'card-2', ownerId: seller.id, isLocked: true };
  const secondListing = { ...listing, id: 'listing-2', cardId: secondCard.id, card: secondCard, status: 'ACTIVE' };
  prisma.memStore.cards.set(secondCard.id, secondCard);
  prisma.memStore.listings.set(secondListing.id, secondListing);
  const buyerBeforeRejectedCredit = buyer.coins;
  await assert.rejects(() => service.buyListing(buyer.id, secondListing.id), /balance limit/);
  assert.equal(buyer.coins, buyerBeforeRejectedCredit, 'failed seller credit must not debit buyer');
  assert.equal(secondCard.ownerId, seller.id, 'failed seller credit must not transfer card');
  assert.equal(secondListing.status, 'ACTIVE', 'failed seller credit must leave listing active');
  console.log('Marketplace authorization and concurrency tests passed');
}

void main();
