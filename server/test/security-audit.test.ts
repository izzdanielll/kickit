import { strict as assert } from 'node:assert';
import { SecurityAuditService } from '../src/security-audit/security-audit.service';

async function main() {
  const config = { get: (key: string) => key === 'AUDIT_LOG_SECRET' ? 'audit-secret-that-is-longer-than-thirty-two-characters' : undefined, getOrThrow: () => 'unused' };
  const events: any[] = [];
  const memoryService = new SecurityAuditService(
    config as any,
    { isDbConnected: false, memStore: { securityEvents: events } } as any,
    { increment: () => undefined } as any,
  );
  await memoryService.record('LOGIN_FAILED', { ip: '203.0.113.10', userAgent: 'test-agent' }, { identifier: 'Person@Example.com' });
  assert.equal(events.length, 1);
  assert.equal(events[0].identifierHash.length, 64);
  assert.equal(events[0].ipHash.length, 64);
  assert.equal(JSON.stringify(events[0]).includes('person@example.com'), false, 'raw identifier must never be stored');
  assert.equal(JSON.stringify(events[0]).includes('203.0.113.10'), false, 'raw IP must never be stored');

  let failures = 0;
  const unavailableService = new SecurityAuditService(
    config as any,
    { isDbConnected: true, securityEvent: { create: async () => { throw new Error('database unavailable'); } } } as any,
    { increment: (name: string) => { if (name === 'security_audit_write_failures') failures += 1; } } as any,
  );
  await unavailableService.record('LOGIN_SUCCEEDED', {}, {});
  assert.equal(failures, 1, 'dropped audit writes must increment an alertable metric');
  console.log('Security audit privacy and availability tests passed');
}

void main();
