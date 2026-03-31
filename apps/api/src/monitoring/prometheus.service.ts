import { Injectable, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

// Prometheus 권장 HTTP latency 버킷 (초 단위, 표준 지수 분포)
// eslint-disable-next-line no-magic-numbers
const HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

@Injectable()
export class PrometheusService implements OnModuleInit {
  private readonly registry = new Registry();

  /** HTTP 요청 처리 지연 (초) */
  readonly httpRequestDuration: Histogram;

  /** HTTP 요청 누적 횟수 */
  readonly httpRequestsTotal: Counter;

  constructor() {
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status'] as const,
      buckets: HTTP_DURATION_BUCKETS,
      registers: [this.registry],
    });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'] as const,
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
