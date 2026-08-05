type Environment = Record<string, unknown>;

function integerInRange(env: Environment, name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function durationSeconds(value: unknown): number {
  const match = String(value ?? '').match(/^(\d+)(s|m|h)$/);
  if (!match) throw new Error('JWT_EXPIRES_IN must use seconds, minutes, or hours (for example, 15m)');
  const multiplier = { s: 1, m: 60, h: 3600 }[match[2] as 's' | 'm' | 'h'];
  return Number(match[1]) * multiplier;
}

function validateOrigin(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('CLIENT_URL contains an invalid URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('CLIENT_URL must contain only HTTPS origins without credentials, paths, queries, or fragments');
  }
}

function validateDatabaseUrl(raw: unknown) {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error('DATABASE_URL must identify a PostgreSQL host and database');
  }
  if (!['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')) {
    throw new Error('DATABASE_URL must enforce TLS with sslmode=require, verify-ca, or verify-full in production');
  }
}

export function validateEnvironment(env: Environment): Environment {
  const secret = env.JWT_SECRET;
  if (typeof secret !== 'string' || secret.length < 32 || /replace|change-this|example/i.test(secret)) {
    throw new Error('JWT_SECRET must be a unique secret of at least 32 characters');
  }
  if (env.NODE_ENV !== 'production') return env;

  validateDatabaseUrl(env.DATABASE_URL);
  if (!env.REDIS_URL || !String(env.REDIS_URL).startsWith('rediss://')) {
    throw new Error('REDIS_URL is required and must use TLS (rediss://) in production');
  }
  const clientOrigins = String(env.CLIENT_URL ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  if (!clientOrigins.length) throw new Error('CLIENT_URL must contain at least one HTTPS origin in production');
  clientOrigins.forEach(validateOrigin);
  if (!env.SPORTS_API_URL || !env.SPORTS_API_KEY) throw new Error('SPORTS_API_URL and SPORTS_API_KEY are required in production');
  let sportsUrl: URL;
  try { sportsUrl = new URL(String(env.SPORTS_API_URL)); } catch { throw new Error('SPORTS_API_URL must be a valid HTTPS URL'); }
  if (sportsUrl.protocol !== 'https:' || sportsUrl.username || sportsUrl.password) throw new Error('SPORTS_API_URL must be a valid HTTPS URL without credentials');

  const minimumCoverage = Number(env.SPORTS_MIN_COVERAGE_PERCENT ?? 95);
  if (!Number.isFinite(minimumCoverage) || minimumCoverage < 1 || minimumCoverage > 100) {
    throw new Error('SPORTS_MIN_COVERAGE_PERCENT must be between 1 and 100');
  }
  integerInRange(env, 'TRUST_PROXY_HOPS', 0, 0, 2);
  if (typeof env.AUDIT_LOG_SECRET !== 'string' || env.AUDIT_LOG_SECRET.length < 32 || env.AUDIT_LOG_SECRET === secret || /replace|example/i.test(env.AUDIT_LOG_SECRET)) {
    throw new Error('AUDIT_LOG_SECRET must be a unique secret of at least 32 characters and different from JWT_SECRET');
  }
  if (env.REQUIRE_EMAIL_VERIFICATION !== 'true') throw new Error('REQUIRE_EMAIL_VERIFICATION must be true in production');
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error('RESEND_API_KEY and EMAIL_FROM are required in production');
  if (typeof env.METRICS_TOKEN !== 'string' || env.METRICS_TOKEN.length < 32 || /replace|example/i.test(env.METRICS_TOKEN)) {
    throw new Error('METRICS_TOKEN must be a unique secret of at least 32 characters in production');
  }

  const jwtSeconds = durationSeconds(env.JWT_EXPIRES_IN ?? '15m');
  if (jwtSeconds < 300 || jwtSeconds > 86400) throw new Error('JWT_EXPIRES_IN must be between 5 minutes and 24 hours');
  const cookieLifetime = integerInRange(env, 'JWT_COOKIE_MAX_AGE_MS', 900000, 300000, 86400000);
  if (cookieLifetime > jwtSeconds * 1000) throw new Error('JWT_COOKIE_MAX_AGE_MS cannot exceed JWT_EXPIRES_IN');
  integerInRange(env, 'EMAIL_VERIFICATION_TTL_MS', 86400000, 900000, 172800000);
  integerInRange(env, 'PASSWORD_RESET_TTL_MS', 3600000, 300000, 86400000);
  integerInRange(env, 'ACCOUNT_REQUEST_MIN_DELAY_MS', 750, 500, 3000);
  integerInRange(env, 'ACCOUNT_TOKEN_RETENTION_DAYS', 7, 1, 30);
  integerInRange(env, 'SECURITY_EVENT_RETENTION_DAYS', 90, 30, 365);
  return env;
}
