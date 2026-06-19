import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * JWT 토큰의 managedGuilds 목록과 요청 guildId를 대조하여
 * 해당 길드에 접근 권한이 있는지 검증한다.
 *
 * JwtAuthGuard 이후에 적용되어야 한다.
 * 라우트 파라미터에 guildId가 없으면 통과시킨다.
 */
@Injectable()
export class GuildMembershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Discord 이벤트 등 non-HTTP 컨텍스트에서는 request.params가 없으므로 skip
    if (!request?.params) return true;

    const guildId = request.params['guildId'] as string | undefined;

    if (!guildId) return true;

    const user = request.user as
      | { guilds?: Array<{ id: string }>; role?: string | null }
      | undefined;

    // JWT 인증되지 않은 요청(auth, health 등)은 통과
    if (!user?.guilds) return true;

    // 관리자 read-only 우회: role 보유자의 GET 요청은 멤버십 무관 통과. non-GET 은 기존 멤버십 로직으로 낙하 → 비멤버 403
    if (user.role != null && request.method === 'GET') {
      return true;
    }

    const hasAccess = user.guilds.some((g) => g.id === guildId);
    if (!hasAccess) {
      throw new ForbiddenException('해당 길드에 접근 권한이 없습니다.');
    }

    return true;
  }
}
