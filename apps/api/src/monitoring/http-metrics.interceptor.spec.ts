import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { of, throwError } from 'rxjs';
import type { Mocked } from 'vitest';

import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { type PrometheusService } from './prometheus.service';

function makeExecutionContext(req: Partial<Request>, res: Partial<Response>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req as Request,
      getResponse: () => res as Response,
    }),
  } as unknown as ExecutionContext;
}

function makeCallHandler(value: unknown = {}): CallHandler {
  return {
    handle: () => of(value),
  };
}

function makeErrorCallHandler(error: Error): CallHandler {
  return {
    handle: () => throwError(() => error),
  };
}

// eslint-disable-next-line max-lines-per-function -- describe 블록은 구조상 불가피하게 길어진다
describe('HttpMetricsInterceptor', () => {
  let interceptor: HttpMetricsInterceptor;
  let prometheus: Mocked<PrometheusService>;

  beforeEach(() => {
    prometheus = {
      httpRequestDuration: {
        labels: vi.fn().mockReturnValue({ observe: vi.fn() }),
      },
      httpRequestsTotal: {
        labels: vi.fn().mockReturnValue({ inc: vi.fn() }),
      },
    } as unknown as Mocked<PrometheusService>;

    interceptor = new HttpMetricsInterceptor(prometheus);
  });

  describe('intercept', () => {
    it('요청 처리 후 httpRequestDuration Histogram이 갱신된다', async () => {
      const req = { method: 'GET', route: { path: '/api/test' }, path: '/api/test' };
      const res = { statusCode: 200 };
      const ctx = makeExecutionContext(req, res);
      const handler = makeCallHandler();

      await new Promise<void>((resolve) => {
        interceptor.intercept(ctx, handler).subscribe({ complete: resolve });
      });

      expect(prometheus.httpRequestDuration.labels).toHaveBeenCalledWith('GET', '/api/test', '200');
      const observeMock = prometheus.httpRequestDuration.labels('GET', '/api/test', '200')
        .observe as ReturnType<typeof vi.fn>;
      expect(observeMock).toHaveBeenCalled();
    });

    it('요청 처리 후 httpRequestsTotal Counter가 갱신된다', async () => {
      const req = {
        method: 'POST',
        route: { path: '/api/guilds/:guildId/voice' },
        path: '/api/guilds/123/voice',
      };
      const res = { statusCode: 201 };
      const ctx = makeExecutionContext(req, res);
      const handler = makeCallHandler();

      await new Promise<void>((resolve) => {
        interceptor.intercept(ctx, handler).subscribe({ complete: resolve });
      });

      expect(prometheus.httpRequestsTotal.labels).toHaveBeenCalledWith(
        'POST',
        '/api/guilds/:guildId/voice',
        '201',
      );
    });

    it('path 레이블에 라우트 패턴이 사용된다 (실제 파라미터 값 대신)', async () => {
      const routePattern = '/api/guilds/:guildId/voice/stats';
      const req = {
        method: 'GET',
        route: { path: routePattern },
        path: '/api/guilds/abc123/voice/stats',
      };
      const res = { statusCode: 200 };
      const ctx = makeExecutionContext(req, res);
      const handler = makeCallHandler();

      await new Promise<void>((resolve) => {
        interceptor.intercept(ctx, handler).subscribe({ complete: resolve });
      });

      // route.path(패턴)이 사용되어야 하고, 실제 경로(/api/guilds/abc123/...) 는 사용되면 안 됨
      const callArgs = (prometheus.httpRequestDuration.labels as ReturnType<typeof vi.fn>).mock
        .calls[0] as string[];
      expect(callArgs[1]).toBe(routePattern);
      expect(callArgs[1]).not.toBe('/api/guilds/abc123/voice/stats');
    });

    it('route 정보가 없으면 req.path를 fallback으로 사용한다', async () => {
      const req = { method: 'GET', route: undefined, path: '/unknown-path' };
      const res = { statusCode: 404 };
      const ctx = makeExecutionContext(req, res);
      const handler = makeCallHandler();

      await new Promise<void>((resolve) => {
        interceptor.intercept(ctx, handler).subscribe({ complete: resolve });
      });

      const callArgs = (prometheus.httpRequestDuration.labels as ReturnType<typeof vi.fn>).mock
        .calls[0] as string[];
      expect(callArgs[1]).toBe('/unknown-path');
    });

    it('에러 응답 시에도 Histogram과 Counter가 기록된다', async () => {
      const req = {
        method: 'DELETE',
        route: { path: '/api/resource/:id' },
        path: '/api/resource/1',
      };
      const res = { statusCode: 500 };
      const ctx = makeExecutionContext(req, res);
      const handler = makeErrorCallHandler(new Error('Internal error'));

      await new Promise<void>((resolve) => {
        interceptor.intercept(ctx, handler).subscribe({
          error: () => resolve(),
        });
      });

      expect(prometheus.httpRequestDuration.labels).toHaveBeenCalledWith(
        'DELETE',
        '/api/resource/:id',
        '500',
      );
      expect(prometheus.httpRequestsTotal.labels).toHaveBeenCalledWith(
        'DELETE',
        '/api/resource/:id',
        '500',
      );
    });

    it('status 레이블은 숫자가 아닌 문자열로 기록된다', async () => {
      const req = { method: 'GET', route: { path: '/health' }, path: '/health' };
      const res = { statusCode: 200 };
      const ctx = makeExecutionContext(req, res);
      const handler = makeCallHandler();

      await new Promise<void>((resolve) => {
        interceptor.intercept(ctx, handler).subscribe({ complete: resolve });
      });

      const callArgs = (prometheus.httpRequestsTotal.labels as ReturnType<typeof vi.fn>).mock
        .calls[0] as string[];
      expect(callArgs[2]).toBe('200');
      expect(typeof callArgs[2]).toBe('string');
    });
  });
});
