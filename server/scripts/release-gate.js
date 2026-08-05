'use strict';

const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');

const REQUIRED_CHECKS = [
  'ci', 'imageScans', 'stagingMigrations', 'stagingAcceptance', 'authenticatedLoad',
  'restoreDrill', 'rollbackDrill', 'alertDelivery', 'productionSmoke',
];
const REQUIRED_APPROVALS = ['operations', 'security', 'legalProduct'];
const MAX_TECHNICAL_EVIDENCE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function validTimestamp(value, now) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now + 5 * 60 * 1000 && now - timestamp <= MAX_TECHNICAL_EVIDENCE_AGE_MS;
}

function validateEvidence(evidence, expectedCommit, now = Date.now()) {
  const errors = [];
  if (evidence?.format !== 'kickit-release-evidence-v1') errors.push('unsupported evidence format');
  if (!/^[0-9a-f]{40}$/i.test(expectedCommit)) errors.push('RELEASE_COMMIT_SHA must be a full 40-character Git SHA');
  if (evidence?.releaseCommit !== expectedCommit) errors.push('evidence commit does not match RELEASE_COMMIT_SHA');
  if (evidence?.environment !== 'production') errors.push('environment must be production');

  for (const name of REQUIRED_CHECKS) {
    const check = evidence?.checks?.[name];
    if (check?.status !== 'passed') errors.push(`${name}: status must be passed`);
    if (typeof check?.evidence !== 'string' || !check.evidence.trim()) errors.push(`${name}: evidence reference is required`);
    if (!validTimestamp(check?.recordedAt, now)) errors.push(`${name}: recordedAt must be a valid timestamp from the last 14 days`);
  }
  for (const name of REQUIRED_APPROVALS) {
    const approval = evidence?.approvals?.[name];
    if (approval?.approved !== true) errors.push(`${name}: approval is required`);
    if (typeof approval?.owner !== 'string' || approval.owner.trim().length < 2) errors.push(`${name}: named owner is required`);
    if (!Number.isFinite(Date.parse(approval?.recordedAt))) errors.push(`${name}: valid recordedAt is required`);
  }
  return errors;
}

async function main() {
  const file = process.env.RELEASE_EVIDENCE_FILE;
  const expectedCommit = process.env.RELEASE_COMMIT_SHA ?? '';
  if (!file) throw new Error('Set RELEASE_EVIDENCE_FILE to the completed release evidence JSON file');
  const evidence = JSON.parse(await readFile(resolve(file), 'utf8'));
  const errors = validateEvidence(evidence, expectedCommit);
  console.log(JSON.stringify({ status: errors.length ? 'failed' : 'passed', releaseCommit: evidence.releaseCommit, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ status: 'failed', message: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  });
}

module.exports = { validateEvidence };
