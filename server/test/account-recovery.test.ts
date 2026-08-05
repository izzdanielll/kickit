import { strict as assert } from 'node:assert';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { AuthService } from '../src/auth/auth.service';

async function main() {
  const secret = 'test-secret-that-is-more-than-thirty-two-characters';
  const user = { id: 'user-1', email: 'person@example.com', username: 'Person', passwordHash: await bcrypt.hash('Password1', 4), emailVerifiedAt: null };
  const sessions = new Map<string, any>([['session-1', { id: 'session-1', userId: user.id, expiresAt: new Date(Date.now() + 60_000), revokedAt: null }]]);
  const accountTokens = new Map<string, any>();
  const prisma = { isDbConnected: false, memStore: { users: new Map([[user.id, user], [user.email, user]]), sessions, accountTokens, securityEvents: [] } };
  const config = {
    get: (key: string, fallback?: string) => ({ REQUIRE_EMAIL_VERIFICATION: 'true', CLIENT_URL: 'https://kickit.example' } as Record<string, string>)[key] ?? fallback,
    getOrThrow: () => secret,
  };
  const sent: string[] = [];
  const email = { send: async (_to: string, _subject: string, text: string) => { sent.push(text); } };
  const audit = { record: async () => undefined };
  const auth = new AuthService(prisma as any, new JwtService({ secret }), config as any, audit as any, email as any);

  await auth.requestEmailVerification(user.email);
  const verificationToken = new URL(sent.pop()!.split('\n')[0]).searchParams.get('token')!;
  assert.equal(accountTokens.has(verificationToken), false, 'raw token must not be stored');
  await auth.confirmEmail(verificationToken);
  assert.ok(user.emailVerifiedAt);
  await assert.rejects(() => auth.confirmEmail(verificationToken), /Invalid or expired token/);

  await auth.requestPasswordReset(user.email);
  const resetToken = new URL(sent.pop()!.split('\n')[0]).searchParams.get('token')!;
  await auth.confirmPasswordReset(resetToken, 'NewPassword2');
  assert.equal(await bcrypt.compare('NewPassword2', user.passwordHash), true);
  assert.ok(sessions.get('session-1').revokedAt);
  await assert.rejects(() => auth.confirmPasswordReset(resetToken, 'AnotherPassword3'), /Invalid or expired token/);
  let invalidTokenHashAttempted = false;
  (auth as any).hashPassword = async () => { invalidTokenHashAttempted = true; return 'unused'; };
  await assert.rejects(() => auth.confirmPasswordReset('x'.repeat(43), 'AnotherPassword3'), /Invalid or expired token/);
  assert.equal(invalidTokenHashAttempted, false, 'invalid reset tokens must be rejected before expensive password hashing');

  const databaseToken = 'v'.repeat(43);
  const tokenHash = createHash('sha256').update(databaseToken).digest('hex');
  const stored = { id: 'token-1', userId: user.id, type: 'EMAIL_VERIFICATION', tokenHash, expiresAt: new Date(Date.now() + 60_000), consumedAt: null as Date | null };
  let failUserUpdate = true;
  const tx = {
    accountToken: {
      findUnique: async () => stored,
      updateMany: async () => { if (stored.consumedAt) return { count: 0 }; stored.consumedAt = new Date(); return { count: 1 }; },
    },
    user: { update: async () => { if (failUserUpdate) throw new Error('database write failed'); } },
  };
  const databasePrisma = {
    isDbConnected: true,
    $transaction: async (callback: (transaction: any) => Promise<any>) => {
      const before = stored.consumedAt;
      try { return await callback(tx); } catch (error) { stored.consumedAt = before; throw error; }
    },
  };
  const databaseAuth = new AuthService(databasePrisma as any, new JwtService({ secret }), config as any, audit as any, email as any);
  await assert.rejects(() => databaseAuth.confirmEmail(databaseToken), /database write failed/);
  assert.equal(stored.consumedAt, null, 'token consumption must roll back when verification update fails');
  failUserUpdate = false;
  await databaseAuth.confirmEmail(databaseToken);
  assert.ok(stored.consumedAt);

  const deliveryFailures: string[] = [];
  const failingEmail = { send: async () => { throw new Error('provider unavailable'); } };
  const recoveryAuth = new AuthService(prisma as any, new JwtService({ secret }), config as any, audit as any, failingEmail as any, { increment: (name: string) => deliveryFailures.push(name) } as any);
  assert.deepEqual(await recoveryAuth.requestPasswordReset(user.email), { message: 'If that account exists, a password reset email has been sent.' });
  assert.deepEqual(deliveryFailures, ['email_delivery_failures'], 'delivery failure must alert internally without enumerating the account');
  console.log('Account recovery security tests passed');
}

void main();
