import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';

import { PrometheusService } from './prometheus.service';

const NANOSECONDS_PER_SECOND = 1_000_000_000;

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly prometheus: PrometheusService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<Request>();
    const res = httpCtx.getResponse<Response>();
    const startTime = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.recordMetrics(req, res, startTime),
        error: () => this.recordMetrics(req, res, startTime),
      }),
    );
  }

  private recordMetrics(req: Request, res: Response, startTime: bigint): void {
    const durationSec = Number(process.hrtime.bigint() - startTime) / NANOSECONDS_PER_SECOND;
    // 라우트 패턴 사용: 실제 파라미터 값 대신 패턴으로 카디널리티 폭발 방지
    // as string | undefined: Express @types에서 req.route.path가 any로 타이핑되어 명시적 단언으로 범위를 좁힌다
    const path = (req.route?.path as string | undefined) ?? req.path;
    const method = req.method;
    const status = String(res.statusCode);

    this.prometheus.httpRequestDuration.labels(method, path, status).observe(durationSec);
    this.prometheus.httpRequestsTotal.labels(method, path, status).inc();
  }
}
