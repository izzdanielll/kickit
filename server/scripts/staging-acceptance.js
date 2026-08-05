const { randomUUID } = require('node:crypto');

const target = String(process.env.ACCEPTANCE_API_URL ?? '').replace(/\/$/, '');
const origin = String(process.env.ACCEPTANCE_ORIGIN ?? '').replace(/\/$/, '');
const email = process.env.ACCEPTANCE_EMAIL;
const password = process.env.ACCEPTANCE_PASSWORD;

if (process.env.ACCEPTANCE_CONFIRM !== 'I_UNDERSTAND_THIS_OPENS_ONE_PACK') {
  throw new Error('Set ACCEPTANCE_CONFIRM=I_UNDERSTAND_THIS_OPENS_ONE_PACK to acknowledge the staging mutation');
}
if (!target.startsWith('https://') || !origin.startsWith('https://') || !email || !password) {
  throw new Error('ACCEPTANCE_API_URL, ACCEPTANCE_ORIGIN, ACCEPTANCE_EMAIL, and ACCEPTANCE_PASSWORD are required; URLs must use HTTPS');
}
if (new URL(target).origin !== origin) throw new Error('Acceptance must use the public same-origin /api proxy path');
if (process.env.NODE_ENV === 'production') throw new Error('This acceptance script must not run with NODE_ENV=production');

async function request(path, options = {}, cookie) {
  const response = await fetch(`${target}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      origin,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...options.headers,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const startedAt = new Date().toISOString();
  const live = await request('/health/live');
  assert(live.response.status === 200, `Liveness failed (${live.response.status})`);
  const ready = await request('/health/ready');
  assert(ready.response.status === 200, `Readiness failed (${ready.response.status})`);

  const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert(login.response.status === 201, `Login failed (${login.response.status})`);
  const setCookie = login.response.headers.get('set-cookie') ?? '';
  assert(/kickit_access=/.test(setCookie) && /HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie) && /SameSite=Strict/i.test(setCookie), 'Secure session cookie attributes are incomplete');
  const cookie = setCookie.split(';', 1)[0];

  const before = await request('/auth/me', {}, cookie);
  assert(before.response.status === 200, `Profile failed (${before.response.status})`);
  const packs = await request('/packs', {}, cookie);
  assert(packs.response.status === 200 && Array.isArray(packs.body), 'Pack catalog failed');
  const pack = packs.body.find((item) => Number.isInteger(item.coinCost) && item.coinCost > 0 && item.coinCost <= before.body.coins);
  assert(pack, 'Acceptance account cannot afford an active coin pack');

  const idempotencyKey = randomUUID();
  const open = () => request('/packs/open', { method: 'POST', body: JSON.stringify({ packId: pack.id, idempotencyKey }) }, cookie);
  const [first, replay] = await Promise.all([open(), open()]);
  assert(first.response.status === 201 && replay.response.status === 201, 'Concurrent pack requests failed');
  assert(first.body.packOpeningId === replay.body.packOpeningId, 'Idempotency replay created multiple openings');
  assert(first.body.user.coins === before.body.coins - pack.coinCost && replay.body.user.coins === first.body.user.coins, 'Pack replay did not debit exactly once');

  const logout = await request('/auth/logout', { method: 'POST' }, cookie);
  assert(logout.response.status === 201, `Logout failed (${logout.response.status})`);
  const revoked = await request('/auth/me', {}, cookie);
  assert(revoked.response.status === 401, 'Logged-out session remained authorized');

  console.log(JSON.stringify({
    status: 'passed', startedAt, finishedAt: new Date().toISOString(), target: new URL(target).origin,
    checks: ['live', 'ready', 'secure-cookie', 'authenticated-profile', 'concurrent-pack-idempotency', 'single-debit', 'logout-revocation'],
    packOpeningId: first.body.packOpeningId,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'failed', message: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
