import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private readonly requests = new Map<string, number>();
  private readonly durationBuckets = new Map<string, number>();
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly durationCount = new Map<string, number>();
  private readonly durationSum = new Map<string, number>();
  private readonly buckets = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

  recordHttp(method: string, statusCode: number, durationMs: number) {
    const requestKey = `${method}:${statusCode}`;
    this.requests.set(requestKey, (this.requests.get(requestKey) ?? 0) + 1);
    const seconds = durationMs / 1000;
    this.durationCount.set(method, (this.durationCount.get(method) ?? 0) + 1);
    this.durationSum.set(method, (this.durationSum.get(method) ?? 0) + seconds);
    for (const bucket of this.buckets) {
      if (seconds <= bucket) {
        const key = `${method}:${bucket}`;
        this.durationBuckets.set(key, (this.durationBuckets.get(key) ?? 0) + 1);
      }
    }
  }

  increment(name: 'gameweek_scheduler_failures' | 'gameweek_settlements' | 'security_maintenance_failures' | 'security_audit_write_failures' | 'body_parser_rejections' | 'email_delivery_failures') {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }

  setGauge(name: 'gameweek_scheduler_last_success_timestamp_seconds' | 'gameweek_last_settlement_timestamp_seconds', value: number) {
    if (!Number.isFinite(value)) return;
    this.gauges.set(name, value);
  }

  render() {
    const lines = [
      '# HELP kickit_http_requests_total Total API responses.',
      '# TYPE kickit_http_requests_total counter',
    ];
    for (const [key, value] of this.requests) {
      const [method, status] = key.split(':');
      lines.push(`kickit_http_requests_total{method="${method}",status="${status}"} ${value}`);
    }
    lines.push('# HELP kickit_http_request_duration_seconds Request latency cumulative buckets.');
    lines.push('# TYPE kickit_http_request_duration_seconds histogram');
    for (const [key, value] of this.durationBuckets) {
      const [method, bucket] = key.split(':');
      lines.push(`kickit_http_request_duration_seconds_bucket{method="${method}",le="${bucket}"} ${value}`);
    }
    for (const [method, count] of this.durationCount) {
      lines.push(`kickit_http_request_duration_seconds_bucket{method="${method}",le="+Inf"} ${count}`);
      lines.push(`kickit_http_request_duration_seconds_count{method="${method}"} ${count}`);
      lines.push(`kickit_http_request_duration_seconds_sum{method="${method}"} ${this.durationSum.get(method) ?? 0}`);
    }
    for (const [name, value] of this.counters) {
      lines.push(`# TYPE kickit_${name}_total counter`, `kickit_${name}_total ${value}`);
    }
    for (const [name, value] of this.gauges) {
      lines.push(`# TYPE kickit_${name} gauge`, `kickit_${name} ${value}`);
    }
    lines.push(`# HELP kickit_process_uptime_seconds Process uptime.`, '# TYPE kickit_process_uptime_seconds gauge', `kickit_process_uptime_seconds ${process.uptime()}`);
    lines.push('# HELP kickit_process_resident_memory_bytes Resident memory.', '# TYPE kickit_process_resident_memory_bytes gauge', `kickit_process_resident_memory_bytes ${process.memoryUsage().rss}`);
    return `${lines.join('\n')}\n`;
  }
}
