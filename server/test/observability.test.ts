import { strict as assert } from 'node:assert';
import { MetricsService } from '../src/common/observability/metrics.service';
import { AppController } from '../src/app.controller';

function main() {
const metrics = new MetricsService();
  metrics.recordHttp('GET', 200, 40);
  metrics.recordHttp('GET', 503, 600);
metrics.increment('gameweek_scheduler_failures');
metrics.increment('body_parser_rejections');
metrics.increment('email_delivery_failures');
metrics.setGauge('gameweek_scheduler_last_success_timestamp_seconds', 1234567890);
const output = metrics.render();
  assert.match(output, /kickit_http_requests_total\{method="GET",status="200"\} 1/);
  assert.match(output, /kickit_http_requests_total\{method="GET",status="503"\} 1/);
  assert.match(output, /kickit_http_request_duration_seconds_bucket\{method="GET",le="\+Inf"\} 2/);
  assert.match(output, /kickit_http_request_duration_seconds_count\{method="GET"\} 2/);
  assert.match(output, /kickit_http_request_duration_seconds_sum\{method="GET"\} 0\.64/);
assert.match(output, /kickit_gameweek_scheduler_failures_total 1/);
assert.match(output, /kickit_body_parser_rejections_total 1/);
assert.match(output, /kickit_email_delivery_failures_total 1/);
assert.match(output, /kickit_gameweek_scheduler_last_success_timestamp_seconds 1234567890/);
  assert.equal(output.includes('/api/'), false, 'metrics must not create route or user cardinality');
  const token = 'm'.repeat(32);
  const controller = new AppController({} as any, metrics, { get: () => token } as any, {} as any);
  assert.throws(() => controller.getMetrics({ get: () => 'Bearer wrong' } as any), /Unauthorized/);
  assert.match(controller.getMetrics({ get: () => `Bearer ${token}` } as any), /kickit_process_uptime_seconds/);
  console.log('Observability metrics tests passed');
}

main();
