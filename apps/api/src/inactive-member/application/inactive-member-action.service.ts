import { Injectable, Logger } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';

import { DomainException } from '../../common/domain-exception';
import { getErrorStack } from '../../common/util/error.util';
import { InactiveMemberActionType, InactiveMemberGrade } from '../domain/inactive-member.types';
import { InactiveMemberRepository } from '../infrastructure/inactive-member.repository';
import type { InactiveMemberConfigOrm } from '../infrastructure/inactive-member-config.orm-entity';
import { InactiveMemberDiscordAdapter } from '../infrastructure/inactive-member-discord.adapter';
import { InactiveMemberService } from './inactive-member.service';

export interface ActionResult {
  actionType: InactiveMemberActionType;
  successCount: number;
  failCount: number;
  logId: number;
}

const CONCURRENCY = 5;

@Injectable()
export class InactiveMemberActionService {
  private readonly logger = new Logger(InactiveMemberActionService.name);

  constructor(
    private readonly repo: InactiveMemberRepository,
    private readonly inactiveMemberService: InactiveMemberService,
    private readonly discordAdapter: InactiveMemberDiscordAdapter,
  ) {}

  async executeAction(
    guildId: string,
    actionType: InactiveMemberActionType,
    targetUserIds: string[],
    executorUserId: string | null = null,
  ): Promise<ActionResult> {
    const config = await this.inactiveMemberService.getOrCreateConfig(guildId);
    const guild = await this.discordAdapter.fetchGuild(guildId);
    if (!guild) {
      throw new DomainException('길드를 찾을 수 없습니다.', 'GUILD_NOT_FOUND');
    }

    const guildName = guild.name;
    let successCount = 0;
    let failCount = 0;

    if (actionType === InactiveMemberActionType.ACTION_DM) {
      ({ successCount, failCount } = await this.executeDmAction(
        guildId,
        guildName,
        config,
        targetUserIds,
      ));
    } else if (actionType === InactiveMemberActionType.ACTION_ROLE_ADD) {
      if (!config.inactiveRoleId) {
        throw new DomainException(
          'inactiveRoleId가 설정되지 않아 역할 부여를 실행할 수 없습니다.',
          'INACTIVE_ROLE_NOT_CONFIGURED',
        );
      }
      ({ successCount, failCount } = await this.executeRoleAction(
        guildId,
        targetUserIds,
        config.inactiveRoleId,
        'add',
      ));
    } else if (actionType === InactiveMemberActionType.ACTION_ROLE_REMOVE) {
      if (!config.removeRoleId) {
        throw new DomainException(
          'removeRoleId가 설정되지 않아 역할 제거를 실행할 수 없습니다.',
          'REMOVE_ROLE_NOT_CONFIGURED',
        );
      }
      ({ successCount, failCount } = await this.executeRoleAction(
        guildId,
        targetUserIds,
        config.removeRoleId,
        'remove',
      ));
    } else if (actionType === InactiveMemberActionType.ACTION_KICK) {
      ({ successCount, failCount } = await this.executeKickAction(guildId, targetUserIds));
    }

    const log = await this.repo.saveActionLog({
      guildId,
      actionType,
      targetUserIds,
      executorUserId,
      successCount,
      failCount,
    });

    return { actionType, successCount, failCount, logId: log.id };
  }

  async executeAutoActions(guildId: string, newlyInactiveUserIds: string[]): Promise<void> {
    if (newlyInactiveUserIds.length === 0) return;

    const config = await this.inactiveMemberService.getOrCreateConfig(guildId);

    if (config.autoRoleAdd && config.inactiveRoleId) {
      try {
        await this.executeAction(
          guildId,
          InactiveMemberActionType.ACTION_ROLE_ADD,
          newlyInactiveUserIds,
          null,
        );
      } catch (err) {
        this.logger.error(`[INACTIVE] Auto role add failed guild=${guildId}`, getErrorStack(err));
      }
    }

    if (config.autoDm) {
      try {
        await this.executeAction(
          guildId,
          InactiveMemberActionType.ACTION_DM,
          newlyInactiveUserIds,
          null,
        );
      } catch (err) {
        this.logger.error(`[INACTIVE] Auto DM failed guild=${guildId}`, getErrorStack(err));
      }
    }
  }

  private async executeKickAction(
    guildId: string,
    targetUserIds: string[],
  ): Promise<{ successCount: number; failCount: number }> {
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetUserIds.length; i += CONCURRENCY) {
      const batch = targetUserIds.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (userId) => {
          const isSuccess = await this.discordAdapter.kickMember(
            guildId,
            userId,
            '비활동 회원 관리 — 강제퇴장',
          );
          if (!isSuccess) throw new Error('kick failed');
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') successCount++;
        else failCount++;
      }
    }

    return { successCount, failCount };
  }

  private async executeDmAction(
    guildId: string,
    guildName: string,
    config: InactiveMemberConfigOrm,
    targetUserIds: string[],
  ): Promise<{ successCount: number; failCount: number }> {
    let successCount = 0;
    let failCount = 0;

    const displayNames = await this.repo.findNickNameMap(guildId, targetUserIds);

    for (let i = 0; i < targetUserIds.length; i += CONCURRENCY) {
      const batch = targetUserIds.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (userId) => {
          const displayName = displayNames[userId] ?? userId;
          const embed = this.buildDmEmbed(config, displayName, guildName);
          const isSuccess = await this.discordAdapter.sendDm(guildId, userId, embed);
          if (!isSuccess) throw new Error('dm failed');
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') successCount++;
        else failCount++;
      }
    }

    return { successCount, failCount };
  }

  private async executeRoleAction(
    guildId: string,
    targetUserIds: string[],
    roleId: string,
    action: 'add' | 'remove',
  ): Promise<{ successCount: number; failCount: number }> {
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetUserIds.length; i += CONCURRENCY) {
      const batch = targetUserIds.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (userId) => {
          const isSuccess = await this.discordAdapter.modifyRole(guildId, userId, roleId, action);
          if (!isSuccess) throw new Error('role action failed');
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') successCount++;
        else failCount++;
      }
    }

    return { successCount, failCount };
  }

  private buildDmEmbed(
    config: InactiveMemberConfigOrm,
    nickName: string,
    serverName: string,
  ): EmbedBuilder {
    const title = this.replacePlaceholders(config.dmEmbedTitle ?? '', {
      nickName,
      serverName,
    });
    const body = this.replacePlaceholders(config.dmEmbedBody ?? '', {
      nickName,
      serverName,
    });

    const embed = new EmbedBuilder().setTitle(title).setDescription(body);

    if (config.dmEmbedColor) {
      const colorHex = config.dmEmbedColor.replace('#', '');
      embed.setColor(parseInt(colorHex, 16));
    }

    return embed;
  }

  private replacePlaceholders(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = vars[key];
      return value !== undefined ? String(value) : `{${key}}`;
    });
  }
}

export { InactiveMemberGrade };
