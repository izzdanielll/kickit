import { strict as assert } from 'node:assert';
import { validateEnvironment } from '../src/config/validate-environment';

const production = () => ({
  NODE_ENV: 'production',
  JWT_SECRET: 'jwt_7E8p2mK9vQ4xT6nB3cR5yU1iO0aS8dF2',
  AUDIT_LOG_SECRET: 'audit_2Z9qW4eR7tY1uI5oP8aS3dF6gH0jK2l',
  METRICS_TOKEN: 'metrics_4N8bV2cX6zL0kJ5hG9fD3sA7pQ1wE',
  DATABASE_URL: 'postgresql://app:secret@db.internal/kickit?sslmode=verify-full',
  REDIS_URL: 'rediss://:secret@redis.internal:6380',
  CLIENT_URL: 'https://kickit.test',
  SPORTS_API_URL: 'https://sports.test/v1/stats',
  SPORTS_API_KEY: 'sports-key',
  REQUIRE_EMAIL_VERIFICATION: 'true',
  RESEND_API_KEY: 're_key',
  EMAIL_FROM: 'KickIt <support@kickit.test>',
  JWT_EXPIRES_IN: '15m',
  JWT_COOKIE_MAX_AGE_MS: '900000',
});

assert.equal(validateEnvironment(production()).NODE_ENV, 'production');

for (const [name, mutate, expected] of [
  ['database TLS', (env: any) => { env.DATABASE_URL = 'postgresql://app:secret@db.internal/kickit'; }, /enforce TLS/],
  ['fake database scheme', (env: any) => { env.DATABASE_URL = 'https://db.internal/kickit?sslmode=require'; }, /PostgreSQL host/],
  ['origin path', (env: any) => { env.CLIENT_URL = 'https://kickit.test/login'; }, /only HTTPS origins/],
  ['origin credentials', (env: any) => { env.CLIENT_URL = 'https://user:pass@kickit.test'; }, /only HTTPS origins/],
  ['insecure Redis', (env: any) => { env.REDIS_URL = 'redis://redis.internal'; }, /must use TLS/],
  ['sports URL credentials', (env: any) => { env.SPORTS_API_URL = 'https://key@sports.test/stats'; }, /without credentials/],
  ['placeholder secret', (env: any) => { env.JWT_SECRET = 'replace-with-at-least-32-random-characters'; }, /unique secret/],
  ['long JWT', (env: any) => { env.JWT_EXPIRES_IN = '48h'; }, /between 5 minutes/],
  ['cookie beyond JWT', (env: any) => { env.JWT_COOKIE_MAX_AGE_MS = '3600000'; }, /cannot exceed/],
  ['short recovery delay', (env: any) => { env.ACCOUNT_REQUEST_MIN_DELAY_MS = '100'; }, /between 500 and 3000/],
] as const) {
  const env = production();
  mutate(env);
  assert.throws(() => validateEnvironment(env), expected, name);
}

assert.equal(validateEnvironment({ NODE_ENV: 'development', JWT_SECRET: 'local-secret-with-at-least-32-characters' }).NODE_ENV, 'development');
assert.throws(() => validateEnvironment({ NODE_ENV: 'development', JWT_SECRET: 'short' }), /unique secret/);

console.log('Environment validation tests passed');
