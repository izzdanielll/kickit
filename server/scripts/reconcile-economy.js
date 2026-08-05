const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const PAGE_SIZE = 500;

function verifyChain(user, currency, entries, errors) {
  const opening = entries.filter((entry) => entry.reason === 'INITIAL_GRANT');
  if (opening.length !== 1) {
    errors.push(`${user.id}/${currency}: expected one opening checkpoint, found ${opening.length}`);
    return;
  }
  if (opening[0].amount !== opening[0].balanceAfter) {
    errors.push(`${user.id}/${currency}: opening amount does not equal opening balance`);
  }
  const remaining = entries.filter((entry) => entry.reason !== 'INITIAL_GRANT');
  let balance = opening[0].balanceAfter;
  while (remaining.length) {
    const candidates = remaining.filter((entry) => entry.balanceAfter - entry.amount === balance);
    if (candidates.length !== 1) {
      errors.push(`${user.id}/${currency}: ledger chain breaks at balance ${balance} (${candidates.length} possible next entries)`);
      return;
    }
    const entry = candidates[0];
    balance = entry.balanceAfter;
    remaining.splice(remaining.indexOf(entry), 1);
  }
  const current = currency === 'COINS' ? user.coins : user.gems;
  if (balance !== current) errors.push(`${user.id}/${currency}: ledger ends at ${balance}, account balance is ${current}`);
}

async function verifyReferences(entries, errors) {
  const packEntries = entries.filter((entry) => entry.reason === 'PACK_PURCHASE');
  const marketEntries = entries.filter((entry) => entry.reason === 'MARKETPLACE_PURCHASE' || entry.reason === 'MARKETPLACE_SALE');
  const [openings, listings] = await Promise.all([
    prisma.packOpening.findMany({ where: { id: { in: packEntries.map((entry) => entry.referenceId) } } }),
    prisma.marketplaceListing.findMany({ where: { id: { in: marketEntries.map((entry) => entry.referenceId) } } }),
  ]);
  const openingById = new Map(openings.map((opening) => [opening.id, opening]));
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  for (const entry of packEntries) {
    const opening = openingById.get(entry.referenceId);
    if (!opening || opening.ownerId !== entry.userId || opening.currency !== entry.currency || entry.amount !== -opening.cost) {
      errors.push(`${entry.id}: pack ledger entry does not match its opening`);
    }
  }
  for (const entry of marketEntries) {
    const listing = listingById.get(entry.referenceId);
    const expectedUser = entry.reason === 'MARKETPLACE_PURCHASE' ? listing?.buyerId : listing?.sellerId;
    const expectedAmount = entry.reason === 'MARKETPLACE_PURCHASE' ? -(listing?.price ?? 0) : Math.floor((listing?.price ?? 0) * 0.95);
    if (!listing || listing.status !== 'COMPLETED' || expectedUser !== entry.userId || listing.currency !== entry.currency || entry.amount !== expectedAmount) {
      errors.push(`${entry.id}: marketplace ledger entry does not match its listing`);
    }
  }
}

async function main() {
  let cursor;
  let usersChecked = 0;
  let entriesChecked = 0;
  const errors = [];
  do {
    const users = await prisma.user.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, coins: true, gems: true },
    });
    if (!users.length) break;
    cursor = users.at(-1).id;
    const entries = await prisma.economyTransaction.findMany({ where: { userId: { in: users.map((user) => user.id) } } });
    await verifyReferences(entries, errors);
    const byAccount = new Map();
    for (const entry of entries) {
      const key = `${entry.userId}:${entry.currency}`;
      if (!byAccount.has(key)) byAccount.set(key, []);
      byAccount.get(key).push(entry);
    }
    for (const user of users) {
      verifyChain(user, 'COINS', byAccount.get(`${user.id}:COINS`) ?? [], errors);
      verifyChain(user, 'GEMS', byAccount.get(`${user.id}:GEMS`) ?? [], errors);
    }
    usersChecked += users.length;
    entriesChecked += entries.length;
  } while (true);

  const report = { status: errors.length ? 'failed' : 'passed', usersChecked, entriesChecked, errors: errors.slice(0, 100), truncatedErrors: Math.max(0, errors.length - 100) };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'failed', message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
