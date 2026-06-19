import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminScope } from '@onyu/shared';
import type { Request } from 'express';

import { REQUIRE_SCOPE_KEY } from './require-scope.decorator';

@Injectable()
export class RequireScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<AdminScope[]>(REQUIRE_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as { scopes?: string[] } | undefined;
    const userScopes = user?.scopes ?? [];

    const hasAllScopes = requiredScopes.every((scope) => userScopes.includes(scope));
    if (!hasAllScopes) {
      throw new ForbiddenException('해당 작업을 수행할 권한이 없습니다.');
    }

    return true;
  }
}
