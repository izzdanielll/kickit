import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const port = 3199;
const origin = `http://127.0.0.1:${port}`;
const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const server = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.on('data', (chunk) => { output += chunk; });
server.stderr.on('data', (chunk) => { output += chunk; });

async function getPage() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await fetch(origin, { redirect: 'error' });
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const first = await getPage();
  const body = await first.text();
  const csp = first.headers.get('content-security-policy') ?? '';
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  const scripts = [...body.matchAll(/<script\b([^>]*)>/g)].map((match) => match[1]);

  assert(first.status === 200, `Expected 200, received ${first.status}`);
  assert(nonce, 'CSP is missing a nonce');
  assert(scripts.length > 0, 'Rendered page did not contain framework scripts');
  assert(scripts.every((attributes) => attributes.includes(`nonce="${nonce}"`)), 'A script is missing the CSP nonce');
  assert(!csp.includes("script-src 'unsafe-inline'"), 'Scripts must not allow unsafe-inline');
  assert(!csp.includes("'unsafe-eval'"), 'Production scripts must not allow unsafe-eval');
  assert(csp.includes("object-src 'none'"), 'CSP must block object embedding');
  assert(csp.includes("frame-ancestors 'none'"), 'CSP must block framing');
  assert(first.headers.get('x-content-type-options') === 'nosniff', 'nosniff header is missing');
  assert(first.headers.get('strict-transport-security')?.includes('max-age='), 'HSTS header is missing');

  const second = await getPage();
  const secondNonce = (second.headers.get('content-security-policy') ?? '').match(/'nonce-([^']+)'/)?.[1];
  await second.body?.cancel();
  assert(secondNonce && secondNonce !== nonce, 'CSP nonce must be unique per request');
  console.log(`Security smoke passed (${scripts.length} nonced scripts, unique per-request nonces).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (output) console.error(output);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
}
