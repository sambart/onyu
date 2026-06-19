import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * 슈퍼 관리자 전용 가드.
 * JwtAuthGuard 이후에 적용하여 req.user.isSuperAdmin === true 인 경우에만 통과시킨다.
 * env 재조회 없음 — JWT 발급 시점(AuthService.createToken)에 allowlist 확정.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as { isSuperAdmin?: boolean } | undefined;

    if (user?.isSuperAdmin !== true) {
      throw new ForbiddenException('슈퍼 관리자 권한이 필요합니다.');
    }

    return true;
  }
}
