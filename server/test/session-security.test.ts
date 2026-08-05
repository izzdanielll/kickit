import { strict as assert } from 'node:assert';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';

async function main() {
  const secret = 'test-secret-that-is-more-than-thirty-two-characters';
  const user = { id: 'user-1', email: 'person@example.com', username: 'Person', passwordHash: await bcrypt.hash('Password1', 4), coins: 500, gems: 0 };
  const sessions = new Map<string, any>();
  const prisma = {
    isDbConnected: false,
    memStore: {
      users: new Map<string, any>([[user.id, user], [user.email, user]]),
      sessions,
      securityEvents: [],
      accountTokens: new Map<string, any>(),
    },
  };
  const config = {
    get: (key: string, fallback?: string) => key === 'JWT_COOKIE_MAX_AGE_MS' ? '900000' : fallback,
    getOrThrow: () => secret,
  };
  const auditEvents: string[] = [];
  const audit = { record: async (type: string) => { auditEvents.push(type); } };
  const jwt = new JwtService({ secret, signOptions: { expiresIn: '15m' } });
  const email = { send: async () => undefined };
  const auth = new AuthService(prisma as any, jwt, config as any, audit as any, email as any);

  const response = await auth.login({ email: user.email, password: 'Password1' });
  const payload = jwt.verify<{ sub: string; email: string; jti: string }>(response.accessToken);
  assert.ok(payload.jti);
  assert.equal(sessions.size, 1);

  const strategy = new JwtStrategy(config as any, prisma as any);
  const authenticated = await strategy.validate(payload);
  assert.equal(authenticated.sessionId, payload.jti);

  await auth.logout(user.id, payload.jti);
  await assert.rejects(() => strategy.validate(payload));
  const loginPayloads: Array<{ sub: string; email: string; jti: string }> = [];
  for (let index = 0; index < 12; index++) {
    const login = await auth.login({ email: user.email, password: 'Password1' });
    loginPayloads.push(jwt.verify<{ sub: string; email: string; jti: string }>(login.accessToken));
  }
  const activeSessions = [...sessions.values()].filter((session) => !session.revokedAt && session.expiresAt > new Date());
  assert.equal(activeSessions.length, 10, 'active sessions must be capped per account');
  await assert.rejects(() => strategy.validate(loginPayloads[0]), /Unauthorized/);
  assert.equal((await strategy.validate(loginPayloads.at(-1)!)).sessionId, loginPayloads.at(-1)!.jti);
  assert.deepEqual(auditEvents, ['LOGIN_SUCCEEDED', 'SESSION_REVOKED', ...Array(12).fill('LOGIN_SUCCEEDED')]);
  console.log('Session revocation tests passed');
}

void main();
