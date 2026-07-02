import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * 관리자 전용 가드.
 * JwtAuthGuard 이후에 적용하여 req.user.role 이 null/undefined 가 아닌 경우에만 통과시킨다.
 * (super_admin 및 bot_operator 모두 통과 — 세부 scope 검사는 RequireScopeGuard 에서 수행)
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as { role?: string | null } | undefined;

    if (user?.role == null) {
      throw new ForbiddenException('슈퍼 관리자 권한이 필요합니다.');
    }

    return true;
  }
}
