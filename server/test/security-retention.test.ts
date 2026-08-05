import { strict as assert } from 'node:assert';
import { SecurityMaintenanceService } from '../src/security-audit/security-maintenance.service';

async function main() {
  const now = new Date('2026-08-05T00:00:00.000Z');
  const day = 86_400_000;
  const memStore = {
    sessions: new Map([
      ['expired', { expiresAt: new Date(now.getTime() - 1) }],
      ['active', { expiresAt: new Date(now.getTime() + day) }],
    ]),
    accountTokens: new Map([
      ['old-expired', { expiresAt: new Date(now.getTime() - 8 * day), consumedAt: null }],
      ['recent-expired', { expiresAt: new Date(now.getTime() - day), consumedAt: null }],
      ['old-consumed', { expiresAt: new Date(now.getTime() + day), consumedAt: new Date(now.getTime() - 8 * day) }],
    ]),
    securityEvents: [
      { createdAt: new Date(now.getTime() - 91 * day) },
      { createdAt: new Date(now.getTime() - 10 * day) },
    ],
  };
  const prisma = { isDbConnected: false, memStore };
  const config = { get: (key: string, fallback: string) => ({ ACCOUNT_TOKEN_RETENTION_DAYS: '7', SECURITY_EVENT_RETENTION_DAYS: '90' } as any)[key] ?? fallback };
  const metrics = { increment: () => undefined };
  const service = new SecurityMaintenanceService(prisma as any, config as any, metrics as any);
  const result = await service.run(now);
  assert.deepEqual(result, { sessions: 1, tokens: 2, securityEvents: 1 });
  assert.deepEqual([...memStore.sessions.keys()], ['active']);
  assert.deepEqual([...memStore.accountTokens.keys()], ['recent-expired']);
  assert.equal(memStore.securityEvents.length, 1);
  console.log('Security data retention tests passed');
}

void main();
