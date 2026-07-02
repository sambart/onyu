import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

import { AuditLogRepository } from '../infrastructure/audit-log.repository';

const ADMIN_PATH_PREFIX = '/api/admin/';
const GUILD_PATH_PATTERN = /^\/api\/guilds\/[^/]+/;

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    this.maybeRecord(req);
    return next.handle();
  }

  private maybeRecord(req: Request): void {
    const user = req.user as { discordId?: string; role?: string | null } | undefined;

    // role 이 null/undefined 인 사용자(미등록/비활성)는 감사 대상 제외
    if (user?.role == null) return;
    if (!this.isAuditTarget(req.path)) return;

    const guildId = (req.params?.['guildId'] as string | undefined) ?? null;

    // fire-and-forget — 기록 실패가 본 요청을 막지 않음
    void this.auditLogRepository
      .insert({
        adminDiscordUserId: user.discordId ?? 'unknown',
        guildId,
        httpMethod: req.method,
        requestPath: req.path,
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `audit log insert failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  private isAuditTarget(path: string): boolean {
    return path.startsWith(ADMIN_PATH_PREFIX) || GUILD_PATH_PATTERN.test(path);
  }
}
