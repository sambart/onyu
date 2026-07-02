import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { RolePanelButtonMode } from '@onyu/shared';
import { DiscordAPIError, GuildMember } from 'discord.js';

import { acquireLock, releaseLock } from './role-panel-toggle-lock';

/** Discord REST API 에러 코드 — Missing Permissions */
const DISCORD_ERR_MISSING_PERMISSIONS = 50013;

/** Discord REST API 에러 코드 — Unknown Role */
const DISCORD_ERR_UNKNOWN_ROLE = 10011;

/** Discord REST HTTP 상태 코드 — Forbidden (권한 없음) */
const DISCORD_HTTP_FORBIDDEN = 403;

/** 역할 처리 결과 상태 */
export type RolePanelInteractionStatus =
  | 'GRANTED'
  | 'REMOVED'
  | 'ALREADY_HAS'
  | 'NOT_FOUND'
  | 'NO_PERMISSION'
  | 'UNKNOWN_ROLE'
  | 'LOCKED';

export interface RolePanelInteractionResult {
  status: RolePanelInteractionStatus;
}

/** 서비스 입력 파라미터 */
export interface HandleRolePanelButtonInput {
  guildId: string;
  userId: string;
  member: GuildMember;
  panelId: number;
  buttonId: number;
}

/** GRANT / TOGGLE 처리에 필요한 공통 컨텍스트 */
interface RolePanelRoleContext {
  member: GuildMember;
  roleId: string;
  guildId: string;
  userId: string;
}

/**
 * 역할 패널 버튼 인터랙션 비즈니스 로직.
 * Discord 응답(deferReply / editReply)은 핸들러가 담당하며,
 * 이 서비스는 역할 부여/회수 처리 결과 상태만 반환한다.
 */
@Injectable()
export class RolePanelInteractionService {
  private readonly logger = new Logger(RolePanelInteractionService.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  async handle(input: HandleRolePanelButtonInput): Promise<RolePanelInteractionResult> {
    const { guildId, userId, member, panelId, buttonId } = input;

    // config 조회 — API가 Redis 캐시 우선 → 미스 시 DB 조회
    const response = await this.apiClient.getRolePanelConfig(guildId);

    if (!response.ok || !response.data) {
      this.logger.warn(`[ROLE_PANEL] Config not found: guild=${guildId}`);
      return { status: 'NOT_FOUND' };
    }

    const panelConfig = response.data.find((p) => p.panelId === panelId);
    const buttonConfig = panelConfig?.buttons.find((b) => b.buttonId === buttonId);

    if (!buttonConfig) {
      this.logger.warn(
        `[ROLE_PANEL] Button config not found: guild=${guildId} panel=${panelId} button=${buttonId}`,
      );
      return { status: 'NOT_FOUND' };
    }

    const { roleId, mode } = buttonConfig;
    const ctx: RolePanelRoleContext = { member, roleId, guildId, userId };

    try {
      if (mode === RolePanelButtonMode.GRANT) {
        return await this.handleGrant(ctx);
      }
      return await this.handleToggle(ctx, buttonId);
    } catch (error) {
      return this.mapDiscordError(error, ctx);
    }
  }

  /**
   * GRANT 모드: 이미 보유한 경우 안내만, 미보유 시 역할 부여.
   * 멱등 처리 — add를 호출하지 않고 상태만 알림(UC-04 AF-01).
   */
  private async handleGrant(ctx: RolePanelRoleContext): Promise<RolePanelInteractionResult> {
    const { member, roleId, guildId, userId } = ctx;

    if (member.roles.cache.has(roleId)) {
      return { status: 'ALREADY_HAS' };
    }

    await member.roles.add(roleId);
    this.logger.log(`[ROLE_PANEL] Role granted: guild=${guildId} user=${userId} role=${roleId}`);
    return { status: 'GRANTED' };
  }

  /**
   * TOGGLE 모드: 보유 시 제거, 미보유 시 부여.
   * 인메모리 락으로 동시 클릭 레이스 방지(UC-05 F-01).
   * 단일 프로세스 전제 — 다중 인스턴스 운영 시 분산 락 필요.
   */
  private async handleToggle(
    ctx: RolePanelRoleContext,
    buttonId: number,
  ): Promise<RolePanelInteractionResult> {
    const { member, roleId, guildId, userId } = ctx;
    const lockKey = `${guildId}:${userId}:${buttonId}`;

    if (!acquireLock(lockKey)) {
      return { status: 'LOCKED' };
    }

    try {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
        this.logger.log(
          `[ROLE_PANEL] Role removed: guild=${guildId} user=${userId} role=${roleId}`,
        );
        return { status: 'REMOVED' };
      }
      await member.roles.add(roleId);
      this.logger.log(`[ROLE_PANEL] Role granted: guild=${guildId} user=${userId} role=${roleId}`);
      return { status: 'GRANTED' };
    } finally {
      releaseLock(lockKey);
    }
  }

  /**
   * Discord REST API 에러를 역할 패널 상태로 매핑한다.
   * - 50013(Missing Permissions) / 위계 위반(403) → NO_PERMISSION
   * - 10011(Unknown Role) → UNKNOWN_ROLE
   * - 그 외 → 재던짐 (핸들러 catch → 일반 오류 응답)
   */
  private mapDiscordError(error: unknown, ctx: RolePanelRoleContext): RolePanelInteractionResult {
    const { guildId, userId, roleId } = ctx;

    if (error instanceof DiscordAPIError) {
      this.logger.warn(
        `[ROLE_PANEL] Discord API error: guild=${guildId} user=${userId} role=${roleId} code=${error.code} status=${error.status}`,
      );

      if (
        error.code === DISCORD_ERR_MISSING_PERMISSIONS ||
        error.status === DISCORD_HTTP_FORBIDDEN
      ) {
        return { status: 'NO_PERMISSION' };
      }

      if (error.code === DISCORD_ERR_UNKNOWN_ROLE) {
        return { status: 'UNKNOWN_ROLE' };
      }
    }

    // 그 외 예외는 핸들러 catch 블록에서 일반 오류로 처리
    throw error;
  }
}
