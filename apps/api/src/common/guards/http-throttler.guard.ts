import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * HTTP 요청에만 Rate Limiting을 적용하는 ThrottlerGuard.
 * discord-nestjs는 ExternalContextCreator를 사용하여 getType()이 'http'를 반환하므로,
 * response 객체에 header 메서드가 있는지로 실제 HTTP 요청 여부를 판별한다.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  canActivate(context: ExecutionContext): Promise<boolean> {
    const response = context.switchToHttp().getResponse();
    if (!response || typeof response.header !== 'function') {
      return Promise.resolve(true);
    }
    return super.canActivate(context);
  }

  /**
   * rate-limit 집계 키(클라이언트 IP)를 결정한다.
   * 브라우저 직접 호출(browser→nginx→api)과 웹 SSR 프록시 경유(browser→nginx→web→api) 두 경로의
   * 프록시 홉 수가 달라 req.ip(trust proxy 기반) 만으로는 한쪽 경로가 프록시 IP 하나로 집계된다.
   * nginx 가 $remote_addr 로 덮어써(스푸핑 불가) 두 경로 모두 전달하는 X-Real-IP 를 우선 사용한다.
   * (웹 프록시의 X-Real-IP 전달은 apps/web/app/api/guilds/[...path]/route.ts 에서 보강)
   */
  protected getTracker(req: Request): Promise<string> {
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.length > 0) {
      return Promise.resolve(realIp);
    }
    return Promise.resolve(req.ip ?? '');
  }
}
