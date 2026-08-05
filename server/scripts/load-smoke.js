'use strict';

const target = process.env.LOAD_TARGET || 'http://127.0.0.1:3001/api/health/ready';
const durationMs = Number(process.env.LOAD_DURATION_MS || 10_000);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 20);
const maxErrorRate = Number(process.env.LOAD_MAX_ERROR_RATE || 0.01);
const maxP95Ms = Number(process.env.LOAD_MAX_P95_MS || 500);

if (!Number.isInteger(durationMs) || durationMs < 1000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 500) {
  throw new Error('Invalid load-test duration or concurrency');
}

const latencies = [];
let requests = 0;
let errors = 0;
const deadline = Date.now() + durationMs;

async function worker() {
  while (Date.now() < deadline) {
    const started = performance.now();
    try {
      const response = await fetch(target, { headers: { connection: 'close' }, signal: AbortSignal.timeout(5000) });
      await response.arrayBuffer();
      if (!response.ok) errors += 1;
    } catch {
      errors += 1;
    } finally {
      latencies.push(performance.now() - started);
      requests += 1;
    }
  }
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] || 0;
}

Promise.all(Array.from({ length: concurrency }, worker)).then(() => {
  latencies.sort((a, b) => a - b);
  const errorRate = requests ? errors / requests : 1;
  const report = {
    target,
    durationMs,
    concurrency,
    requests,
    requestsPerSecond: Number((requests / (durationMs / 1000)).toFixed(2)),
    errors,
    errorRate: Number(errorRate.toFixed(4)),
    p50Ms: Number(percentile(latencies, 0.50).toFixed(2)),
    p95Ms: Number(percentile(latencies, 0.95).toFixed(2)),
    p99Ms: Number(percentile(latencies, 0.99).toFixed(2)),
  };
  console.log(JSON.stringify(report, null, 2));
  if (errorRate > maxErrorRate || report.p95Ms > maxP95Ms) process.exit(1);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
