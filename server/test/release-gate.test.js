'use strict';

const assert = require('node:assert/strict');
const { validateEvidence } = require('../scripts/release-gate');

const commit = 'a'.repeat(40);
const now = Date.parse('2026-08-05T00:00:00.000Z');
const recordedAt = '2026-08-04T00:00:00.000Z';
const passed = (evidence) => ({ status: 'passed', evidence, recordedAt });
const evidence = {
  format: 'kickit-release-evidence-v1', releaseCommit: commit, environment: 'production',
  checks: {
    ci: passed('run/1'), imageScans: passed('run/1#images'), stagingMigrations: passed('report/migrations'),
    stagingAcceptance: passed('report/acceptance'), authenticatedLoad: passed('report/load'),
    restoreDrill: passed('report/restore'), rollbackDrill: passed('report/rollback'),
    alertDelivery: passed('report/alerts'), productionSmoke: passed('report/smoke'),
  },
  approvals: {
    operations: { approved: true, owner: 'Ops Owner', recordedAt },
    security: { approved: true, owner: 'Security Owner', recordedAt },
    legalProduct: { approved: true, owner: 'Product Owner', recordedAt },
  },
};

assert.deepEqual(validateEvidence(evidence, commit, now), []);
assert.match(validateEvidence({ ...evidence, releaseCommit: 'b'.repeat(40) }, commit, now).join('\n'), /commit does not match/);
const stale = structuredClone(evidence);
stale.checks.restoreDrill.recordedAt = '2026-01-01T00:00:00.000Z';
assert.match(validateEvidence(stale, commit, now).join('\n'), /restoreDrill/);
const missing = structuredClone(evidence);
missing.approvals.security.approved = false;
delete missing.checks.productionSmoke.evidence;
const missingErrors = validateEvidence(missing, commit, now).join('\n');
assert.match(missingErrors, /security: approval is required/);
assert.match(missingErrors, /productionSmoke: evidence reference is required/);
console.log('Release evidence gate tests passed');
