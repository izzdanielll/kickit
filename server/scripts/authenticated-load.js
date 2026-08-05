'use strict';

const target = String(process.env.AUTH_LOAD_API_URL ?? '').replace(/\/$/, '');
const origin = String(process.env.AUTH_LOAD_ORIGIN ?? '').replace(/\/$/, '');
const email = process.env.AUTH_LOAD_EMAIL;
const password = process.env.AUTH_LOAD_PASSWORD;
const durationMs = Number(process.env.AUTH_LOAD_DURATION_MS ?? 60_000);
const requestsPerSecond = Number(process.env.AUTH_LOAD_REQUESTS_PER_SECOND ?? 1);
const maxErrorRate = Number(process.env.AUTH_LOAD_MAX_ERROR_RATE ?? 0.01);
const maxP95Ms = Number(process.env.AUTH_LOAD_MAX_P95_MS ?? 750);
const paths = ['/auth/me', '/cards?page=1&limit=20', '/packs', '/marketplace/listings?page=1&limit=20'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] || 0;
}

async function request(path, cookie, options = {}) {
  return fetch(`${target}${path}`, {
    ...options,
    headers: {
      accept: 'application/json', origin,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
}

async function main() {
  assert(process.env.AUTH_LOAD_CONFIRM === 'I_UNDERSTAND_THIS_CREATES_A_SESSION', 'Set AUTH_LOAD_CONFIRM=I_UNDERSTAND_THIS_CREATES_A_SESSION');
  assert(target && origin && email && password, 'AUTH_LOAD_API_URL, AUTH_LOAD_ORIGIN, AUTH_LOAD_EMAIL, and AUTH_LOAD_PASSWORD are required');
  const targetUrl = new URL(target);
  const localHttpAllowed = process.env.AUTH_LOAD_ALLOW_HTTP === 'true' && ['127.0.0.1', 'localhost', '::1'].includes(targetUrl.hostname);
  assert(targetUrl.protocol === 'https:' || localHttpAllowed, 'Authenticated load target must use HTTPS (HTTP is allowed only for an explicitly enabled loopback target)');
  assert(targetUrl.origin === origin, 'Authenticated load must use the public same-origin /api proxy path');
  assert(process.env.NODE_ENV !== 'production', 'Run this test from a staging/load-runner environment, never inside production');
  assert(Number.isInteger(durationMs) && durationMs >= 10_000 && durationMs <= 15 * 60_000, 'AUTH_LOAD_DURATION_MS must be between 10000 and 900000');
  assert(Number.isFinite(requestsPerSecond) && requestsPerSecond > 0 && requestsPerSecond <= 1.25, 'Each worker must stay at or below 1.25 requests/second to preserve the per-IP abuse-control budget');
  assert(Number.isFinite(maxErrorRate) && maxErrorRate >= 0 && maxErrorRate <= 0.1, 'Invalid AUTH_LOAD_MAX_ERROR_RATE');
  assert(Number.isFinite(maxP95Ms) && maxP95Ms >= 50 && maxP95Ms <= 10_000, 'Invalid AUTH_LOAD_MAX_P95_MS');

  const login = await request('/auth/login', undefined, { method: 'POST', body: JSON.stringify({ email, password }) });
  assert(login.status === 201, `Login failed (${login.status})`);
  const setCookie = login.headers.get('set-cookie') ?? '';
  assert(/kickit_access=/.test(setCookie) && /HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie) && /SameSite=Strict/i.test(setCookie), 'Secure session cookie attributes are incomplete');
  const cookie = setCookie.split(';', 1)[0];
  await login.arrayBuffer();

  const latencies = [];
  const statusCounts = {};
  let errors = 0;
  let requests = 0;
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + durationMs;
  const intervalMs = 1000 / requestsPerSecond;
  try {
    while (Date.now() < deadline) {
      const iterationStarted = performance.now();
      const path = paths[requests % paths.length];
      try {
        const response = await request(path, cookie);
        statusCounts[response.status] = (statusCounts[response.status] ?? 0) + 1;
        await response.arrayBuffer();
        if (response.status !== 200) errors += 1;
      } catch {
        errors += 1;
        statusCounts.network = (statusCounts.network ?? 0) + 1;
      }
      latencies.push(performance.now() - iterationStarted);
      requests += 1;
      const delay = Math.max(0, intervalMs - (performance.now() - iterationStarted));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  } finally {
    const logout = await request('/auth/logout', cookie, { method: 'POST' }).catch(() => undefined);
    if (logout) await logout.arrayBuffer();
  }

  latencies.sort((left, right) => left - right);
  const errorRate = requests ? errors / requests : 1;
  const report = {
    status: errorRate <= maxErrorRate && percentile(latencies, 0.95) <= maxP95Ms ? 'passed' : 'failed',
    startedAt, finishedAt: new Date().toISOString(), target: targetUrl.origin,
    durationMs, requestsPerSecond, requests, errors, errorRate: Number(errorRate.toFixed(4)), statusCounts,
    p50Ms: Number(percentile(latencies, 0.5).toFixed(2)),
    p95Ms: Number(percentile(latencies, 0.95).toFixed(2)),
    p99Ms: Number(percentile(latencies, 0.99).toFixed(2)),
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'passed') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'failed', message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
