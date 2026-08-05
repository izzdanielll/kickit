const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const manifestPath = process.env.RESTORE_SNAPSHOT_FILE;

function fail(message) {
  throw new Error(message);
}

async function main() {
  if (!manifestPath) fail('Set RESTORE_SNAPSHOT_FILE to the source database snapshot JSON file');
  const manifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
  if (manifest.format !== 'kickit-database-snapshot-v1' || !manifest.counts || !Array.isArray(manifest.migrations)) {
    fail('The restore snapshot manifest is invalid or unsupported');
  }

  const actualCounts = Object.fromEntries(await Promise.all(Object.keys(manifest.counts).map(async (model) => {
    if (!prisma[model] || typeof prisma[model].count !== 'function') fail(`Snapshot contains unknown model: ${model}`);
    return [model, await prisma[model].count()];
  })));
  const actualMigrations = await prisma.$queryRaw`
    SELECT migration_name AS "name", checksum
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name
  `;
  const invalidForeignKeys = await prisma.$queryRaw`
    SELECT conname AS "name"
    FROM pg_constraint
    WHERE contype = 'f' AND connamespace = 'public'::regnamespace AND NOT convalidated
  `;

  const errors = [];
  for (const [model, expected] of Object.entries(manifest.counts)) {
    if (!Number.isSafeInteger(expected) || expected < 0) errors.push(`${model}: invalid expected count`);
    else if (actualCounts[model] !== expected) errors.push(`${model}: expected ${expected}, found ${actualCounts[model]}`);
  }
  if (JSON.stringify(actualMigrations) !== JSON.stringify(manifest.migrations)) errors.push('applied migration names or checksums differ from the source snapshot');
  if (invalidForeignKeys.length) errors.push(`unvalidated foreign keys: ${invalidForeignKeys.map((constraint) => constraint.name).join(', ')}`);

  const report = {
    status: errors.length ? 'failed' : 'passed',
    sourceCapturedAt: manifest.capturedAt,
    verifiedAt: new Date().toISOString(),
    counts: actualCounts,
    migrationsChecked: actualMigrations.length,
    errors,
  };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'failed', message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
