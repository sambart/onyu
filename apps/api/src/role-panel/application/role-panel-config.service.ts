import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DISCORD_ADMINISTRATOR_BIT, type RolePanelDisabledReason } from '@onyu/shared';

/** BigInt 0 상수 (no-magic-numbers 준수) */
const BIGINT_ZERO = 0n;

import type { RolePanelConfigOrm } from '../infrastructure/role-panel-config.orm-entity';
import { RolePanelConfigRepository } from '../infrastructure/role-panel-config.repository';
import { RolePanelDiscordAdapter } from '../infrastructure/role-panel-discord.adapter';
import { RolePanelRedisRepository } from '../infrastructure/role-panel-redis.repository';
import type { CreateRolePanelDto } from '../presentation/create-role-panel.dto';
import type { AssignableRoleDto, RolePanelDto } from '../presentation/role-panel-response.dto';
import type { UpdateRolePanelDto } from '../presentation/update-role-panel.dto';
import { RolePanelPublishService } from './role-panel-publish.service';
import { RolePanelRoleValidator } from './role-panel-role-validator';

@Injectable()
export class RolePanelConfigService {
  private readonly logger = new Logger(RolePanelConfigService.name);

  constructor(
    private readonly configRepo: RolePanelConfigRepository,
    private readonly redisRepo: RolePanelRedisRepository,
    private readonly discordAdapter: RolePanelDiscordAdapter,
    private readonly roleValidator: RolePanelRoleValidator,
    private readonly publishService: RolePanelPublishService,
  ) {}

  /**
   * 길드 패널 목록 조회 (Redis 캐시 우선, 미스 시 DB).
   */
  async getConfigs(guildId: string): Promise<RolePanelDto[]> {
    const cached = await this.redisRepo.getConfig(guildId);
    if (cached) {
      return cached.map((c) => this.toDto(c));
    }

    const configs = await this.configRepo.findByGuildId(guildId);
    if (configs.length > 0) {
      await this.redisRepo.setConfig(guildId, configs);
    }
    return configs.map((c) => this.toDto(c));
  }

  /**
   * 패널 단건 조회. guildId 소유 검증 포함.
   */
  async getConfig(guildId: string, panelId: number): Promise<RolePanelDto> {
    const config = await this.configRepo.findByIdAndGuild(panelId, guildId);
    if (!config) {
      throw new NotFoundException(`RolePanelConfig id=${panelId} not found in guild ${guildId}`);
    }
    return this.toDto(config);
  }

  /**
   * 패널 생성 (published=false).
   * 역할 검증 → 트랜잭션 INSERT → Redis 무효화.
   */
  async createConfig(guildId: string, dto: CreateRolePanelDto): Promise<RolePanelDto> {
    await this.validateRoles(
      guildId,
      dto.buttons.map((b) => b.roleId),
    );

    const config = await this.configRepo.createWithButtons(guildId, dto);
    await this.redisRepo.deleteConfig(guildId);
    return this.toDto(config);
  }

  /**
   * 패널 수정 (버튼 전체 replace).
   * 소유 검증 → 역할 재검증 → 트랜잭션 UPDATE → Redis 무효화 → 게시된 경우 동기화.
   */
  async updateConfig(
    guildId: string,
    panelId: number,
    dto: UpdateRolePanelDto,
  ): Promise<RolePanelDto> {
    const existing = await this.configRepo.findByIdAndGuild(panelId, guildId);
    if (!existing) {
      throw new NotFoundException(`RolePanelConfig id=${panelId} not found in guild ${guildId}`);
    }

    await this.validateRoles(
      guildId,
      dto.buttons.map((b) => b.roleId),
    );

    const oldChannelId = existing.channelId;
    const oldMessageId = existing.messageId;

    await this.configRepo.updateWithButtons(panelId, dto);
    await this.redisRepo.deleteConfig(guildId);

    // 게시된 패널은 Discord 메시지 동기화
    if (existing.published) {
      try {
        await this.publishService.resyncOnUpdate({ guildId, panelId, oldChannelId, oldMessageId });
      } catch (err) {
        this.logger.error(
          `[ROLE_PANEL] resyncOnUpdate failed: guild=${guildId} panel=${panelId}`,
          err instanceof Error ? err.stack : String(err),
        );
        throw err;
      }
    }

    const updated = await this.configRepo.findByIdAndGuild(panelId, guildId);
    if (!updated) {
      throw new NotFoundException(`RolePanelConfig id=${panelId} not found after update`);
    }
    return this.toDto(updated);
  }

  /**
   * 패널 삭제.
   * messageId 존재 시 Discord 메시지 삭제 시도(실패 무시) → DB 삭제 → Redis 무효화.
   */
  async deleteConfig(guildId: string, panelId: number): Promise<void> {
    const config = await this.configRepo.findByIdAndGuild(panelId, guildId);
    if (!config) {
      throw new NotFoundException(`RolePanelConfig id=${panelId} not found in guild ${guildId}`);
    }

    if (config.messageId && config.channelId) {
      await this.discordAdapter.deleteMessage(config.channelId, config.messageId);
    }

    await this.configRepo.deleteById(panelId);
    await this.redisRepo.deleteConfig(guildId);
  }

  /**
   * 패널 게시. PublishService에 위임.
   */
  async publishConfig(guildId: string, panelId: number): Promise<RolePanelDto> {
    const config = await this.publishService.publish(guildId, panelId);
    return this.toDto(config);
  }

  /**
   * 길드의 부여 가능 역할 목록 조회 (웹 역할 선택 UI용).
   * 각 역할에 assignable/disabledReason 메타를 부착한다.
   */
  async getAssignableRoles(guildId: string): Promise<AssignableRoleDto[]> {
    const [roles, botTopPosition] = await Promise.all([
      this.discordAdapter.fetchGuildRoles(guildId),
      this.getBotTopPosition(guildId),
    ]);

    return roles.map((role) => {
      let disabledReason: RolePanelDisabledReason | null = null;

      if ((BigInt(role.permissions) & DISCORD_ADMINISTRATOR_BIT) !== BIGINT_ZERO) {
        disabledReason = 'ADMINISTRATOR';
      } else if (role.id === guildId) {
        disabledReason = 'EVERYONE';
      } else if (role.managed || (role.tags !== undefined && role.tags !== null)) {
        disabledReason = 'MANAGED';
      } else if (role.position >= botTopPosition) {
        disabledReason = 'HIGHER_THAN_BOT';
      }

      return {
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        assignable: disabledReason === null,
        disabledReason,
      };
    });
  }

  /** 봇 최상위 역할 position 산출 (fetchGuildMember + fetchGuildRoles 조합). */
  private async getBotTopPosition(guildId: string): Promise<number> {
    const botUserId = this.discordAdapter.getBotUserId();
    const [botMember, roles] = await Promise.all([
      this.discordAdapter.fetchGuildMember(guildId, botUserId),
      this.discordAdapter.fetchGuildRoles(guildId),
    ]);

    if (!botMember || botMember.roles.length === 0) {
      return 0;
    }

    const rolePositionMap = new Map(roles.map((r) => [r.id, r.position]));
    const botRolePositions = botMember.roles.map((roleId) => rolePositionMap.get(roleId) ?? 0);
    return Math.max(...botRolePositions);
  }

  /** 역할 검증 헬퍼 */
  private async validateRoles(guildId: string, roleIds: string[]): Promise<void> {
    const [roles, botTopPosition] = await Promise.all([
      this.discordAdapter.fetchGuildRoles(guildId),
      this.getBotTopPosition(guildId),
    ]);
    this.roleValidator.validate({ roleIds, roles, botTopPosition, guildId });
  }

  /** ORM 엔티티 → 응답 DTO 변환. */
  private toDto(config: RolePanelConfigOrm): RolePanelDto {
    return {
      id: config.id,
      name: config.name,
      channelId: config.channelId,
      channelName: null, // 1차 생략 (비용 고려)
      messageId: config.messageId,
      embedTitle: config.embedTitle,
      embedDescription: config.embedDescription,
      embedColor: config.embedColor,
      published: config.published,
      buttons: (config.buttons ?? []).map((btn) => ({
        id: btn.id,
        label: btn.label,
        emoji: btn.emoji,
        roleId: btn.roleId,
        roleName: null, // 1차 생략
        mode: btn.mode,
        style: btn.style,
        sortOrder: btn.sortOrder,
      })),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
