import { strict as assert } from 'node:assert';
import { AddressInfo } from 'node:net';
import { createApp } from '../src/main';
import { PrismaService } from '../src/prisma/prisma.service';
import { randomUUID } from 'node:crypto';

async function main() {
  process.env.MAX_ACTIVE_SESSIONS_PER_USER = '3';
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}/api`;
  const email = `e2e-${Date.now()}@example.com`;
  let userId: string | undefined;
  let sellerId: string | undefined;
  try {
    const health = await fetch(`${base}/health/live`, { headers: { connection: 'close' } });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-powered-by'), null, 'framework identity must not be disclosed');
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    await health.arrayBuffer();

    const oversized = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' }, body: JSON.stringify({ email, password: 'Password1', padding: 'x'.repeat(40 * 1024) }),
    });
    assert.equal(oversized.status, 413, 'oversized JSON must be rejected before DTO processing');
    assert.deepEqual(await oversized.json(), { statusCode: 413, message: 'Payload too large' });

    const malformed = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' }, body: '{"email":',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { statusCode: 400, message: 'Malformed request body' });

    const rejectedOrigin = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://attacker.example', connection: 'close' }, body: JSON.stringify({ email, password: 'Password1' }),
    });
    assert.equal(rejectedOrigin.status, 403);
    await rejectedOrigin.arrayBuffer();

    const invalid = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' }, body: JSON.stringify({ email, username: 'E2E Club', password: 'Password1', admin: true }),
    });
    assert.equal(invalid.status, 400, 'unknown fields must be rejected');
    await invalid.arrayBuffer();

    const registration = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' }, body: JSON.stringify({ email, username: `E2E_${Date.now()}`, password: 'Password1' }),
    });
    assert.equal(registration.status, 201);
    const registered = await registration.json() as { user: { id: string } };
    userId = registered.user.id;
    const initialCookie = registration.headers.get('set-cookie');
    let cookie = initialCookie;
    assert.ok(cookie?.includes('kickit_access='));
    assert.ok(cookie?.toLowerCase().includes('httponly'));
    assert.ok(cookie?.toLowerCase().includes('samesite=strict'));

    const sessionCookies = [cookie];
    for (let index = 0; index < 3; index++) {
      const login = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' }, body: JSON.stringify({ email, password: 'Password1' }),
      });
      assert.equal(login.status, 201);
      sessionCookies.push(login.headers.get('set-cookie'));
      await login.arrayBuffer();
    }
    const newestCookie = sessionCookies.at(-1);
    assert.ok(newestCookie);
    cookie = newestCookie;
    const prisma = app.get(PrismaService);
    const activeSessionCount = await prisma.session.count({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    assert.equal(activeSessionCount, 3, 'database-backed active sessions must be capped');
    const evictedSession = await fetch(`${base}/auth/me`, { headers: { cookie: initialCookie!, connection: 'close' } });
    assert.equal(evictedSession.status, 401, 'the oldest session must be revoked when the cap is exceeded');
    await evictedSession.arrayBuffer();

    const profile = await fetch(`${base}/auth/me`, { headers: { cookie: cookie!, connection: 'close' } });
    assert.equal(profile.status, 200);
    assert.equal(profile.headers.get('cache-control'), 'no-store', 'authenticated responses must not be cached');
    const initialProfile = await profile.json() as { email: string; coins: number };
    assert.equal(initialProfile.email, email);

    const packs = await fetch(`${base}/packs`, { headers: { cookie: cookie!, connection: 'close' } });
    assert.equal(packs.status, 200);
    const pack = (await packs.json() as Array<{ id: string; coinCost: number | null }>).find((candidate) => candidate.coinCost === 250);
    assert.ok(pack);
    const idempotencyKey = randomUUID();
    const openings = await Promise.all(Array.from({ length: 5 }, () => fetch(`${base}/packs/open`, {
      method: 'POST',
      headers: { cookie: cookie!, connection: 'close', 'content-type': 'application/json' },
      body: JSON.stringify({ packId: pack!.id, idempotencyKey }),
    })));
    assert.ok(openings.every((response) => response.status === 201));
    const openingBodies = await Promise.all(openings.map((response) => response.json() as Promise<{ packOpeningId: string; cards: unknown[]; user: { coins: number } }>));
    assert.equal(new Set(openingBodies.map((opening) => opening.packOpeningId)).size, 1, 'concurrent idempotent requests must create one opening');
    assert.ok(openingBodies.every((opening) => opening.cards.length === 5));
    assert.ok(openingBodies.every((opening) => opening.user.coins === initialProfile.coins - 250), 'concurrent replay must debit once');
    const ledger = await prisma.economyTransaction.findMany({ where: { userId: registered.user.id }, orderBy: { createdAt: 'asc' } });
    const grants = ledger.filter((entry) => entry.reason === 'INITIAL_GRANT');
    assert.deepEqual(grants.map((entry) => [entry.currency, entry.amount, entry.balanceAfter]).sort(), [
      ['COINS', 500, 500],
      ['GEMS', 0, 0],
    ].sort());
    const packEntries = ledger.filter((entry) => entry.reason === 'PACK_PURCHASE');
    assert.equal(packEntries.length, 1, 'idempotent pack replay must append one ledger debit');
    assert.equal(packEntries[0].amount, -250);
    assert.equal(packEntries[0].balanceAfter, initialProfile.coins - 250);
    await assert.rejects(
      prisma.economyTransaction.update({ where: { id: packEntries[0].id }, data: { amount: -1 } }),
      /append-only/,
      'database must reject ledger mutation',
    );

    const sellerEmail = `e2e-seller-${Date.now()}@example.com`;
    const sellerRegistration = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' }, body: JSON.stringify({ email: sellerEmail, username: `Seller_${Date.now()}`, password: 'Password1' }),
    });
    assert.equal(sellerRegistration.status, 201);
    const sellerBody = await sellerRegistration.json() as { user: { id: string } };
    sellerId = sellerBody.user.id;
    const sellerCookie = sellerRegistration.headers.get('set-cookie')!;
    const sellerOpening = await fetch(`${base}/packs/open`, {
      method: 'POST', headers: { cookie: sellerCookie, connection: 'close', 'content-type': 'application/json' },
      body: JSON.stringify({ packId: pack!.id, idempotencyKey: randomUUID() }),
    });
    assert.equal(sellerOpening.status, 201);
    const sellerPack = await sellerOpening.json() as { cards: Array<{ id: string }>; user: { coins: number } };
    const listingResponse = await fetch(`${base}/marketplace/listings`, {
      method: 'POST', headers: { cookie: sellerCookie, connection: 'close', 'content-type': 'application/json' },
      body: JSON.stringify({ cardId: sellerPack.cards[0].id, price: 100, currency: 'COINS' }),
    });
    assert.equal(listingResponse.status, 201);
    const listing = await listingResponse.json() as { id: string };
    const purchases = await Promise.all(Array.from({ length: 2 }, () => fetch(`${base}/marketplace/buy/${listing.id}`, {
      method: 'POST', headers: { cookie: cookie!, connection: 'close' },
    })));
    assert.deepEqual(purchases.map((response) => response.status).sort(), [201, 404], 'concurrent buyers must complete a listing once');
    await Promise.all(purchases.map((response) => response.arrayBuffer()));

    const purchasedCard = await prisma.card.findUnique({ where: { id: sellerPack.cards[0].id } });
    assert.equal(purchasedCard?.ownerId, userId);
    const buyerAfter = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } });
    const sellerAfter = await prisma.user.findUniqueOrThrow({ where: { id: sellerId }, select: { coins: true } });
    assert.equal(buyerAfter.coins, initialProfile.coins - 250 - 100);
    assert.equal(sellerAfter.coins, sellerPack.user.coins + 95);
    const marketLedger = await prisma.economyTransaction.findMany({ where: { referenceId: listing.id } });
    assert.deepEqual(marketLedger.map((entry) => [entry.reason, entry.amount, entry.balanceAfter]).sort(), [
      ['MARKETPLACE_PURCHASE', -100, buyerAfter.coins],
      ['MARKETPLACE_SALE', 95, sellerAfter.coins],
    ].sort());

    const logout = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { cookie: cookie!, connection: 'close' } });
    assert.equal(logout.status, 201);
    await logout.arrayBuffer();
    const revoked = await fetch(`${base}/auth/me`, { headers: { cookie: cookie!, connection: 'close' } });
    assert.equal(revoked.status, 401, 'revoked session must stop authorizing immediately');
    await revoked.arrayBuffer();
    console.log('HTTP authentication and middleware E2E tests passed');
  } finally {
    const prisma = app.get(PrismaService);
    const userIds = [userId, sellerId].filter((id): id is string => Boolean(id));
    if (userIds.length && prisma.isDbConnected) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL kickit.allow_economy_ledger_mutation = 'on'");
        await tx.economyTransaction.deleteMany({ where: { userId: { in: userIds } } });
        await tx.marketplaceListing.deleteMany({ where: { OR: [{ sellerId: { in: userIds } }, { buyerId: { in: userIds } }] } });
        await tx.squad.deleteMany({ where: { ownerId: { in: userIds } } });
        await tx.card.deleteMany({ where: { ownerId: { in: userIds } } });
        await tx.packOpening.deleteMany({ where: { ownerId: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      });
    }
    await app.close();
  }
}

void main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
