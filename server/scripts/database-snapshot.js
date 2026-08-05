const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const models = [
  'user', 'economyTransaction', 'accountToken', 'session', 'securityEvent',
  'cardTemplate', 'card', 'squad', 'gameweek', 'playerWeeklyScore',
  'tournamentEntry', 'tournamentEntryCard', 'packDefinition', 'packOpening',
  'marketplaceListing', 'squadCard', 'match',
];

async function main() {
  const counts = Object.fromEntries(await Promise.all(models.map(async (model) => [model, await prisma[model].count()])));
  const migrations = await prisma.$queryRaw`
    SELECT migration_name AS "name", checksum
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name
  `;
  console.log(JSON.stringify({
    format: 'kickit-database-snapshot-v1',
    capturedAt: new Date().toISOString(),
    counts,
    migrations,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'failed', message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
