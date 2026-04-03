import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GuildMember } from 'discord.js';
import { Repository } from 'typeorm';

import { VoiceDailyFlushService } from '../../../channel/voice/application/voice-daily-flush-service';
import { VoiceChannelHistoryOrm } from '../../../channel/voice/infrastructure/voice-channel-history.orm-entity';
import { VoiceDailyOrm } from '../../../channel/voice/infrastructure/voice-daily.orm-entity';
import { DomainException } from '../../../common/domain-exception';
import { getErrorStack } from '../../../common/util/error.util';
import { MissionStatus } from '../../domain/newbie-mission.types';
import { NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';
import { NewbieConfigRepository } from '../../infrastructure/newbie-config.repository';
import { NewbieMissionOrmEntity as NewbieMission } from '../../infrastructure/newbie-mission.orm-entity';
import { NewbieMissionRepository } from '../../infrastructure/newbie-mission.repository';
import { NewbieRedisRepository } from '../../infrastructure/newbie-redis.repository';
import type { MissionEmbedItem } from './mission-discord.presenter';
import { MissionDiscordPresenter } from './mission-discord.presenter';
import { MissionDiscordActionService } from './mission-discord-action.service';

@Injectable()
export class MissionService {
  private readonly logger = new Logger(MissionService.name);

  constructor(
    private readonly missionRepo: NewbieMissionRepository,
    private readonly configRepo: NewbieConfigRepository,
    private readonly newbieRedis: NewbieRedisRepository,
    private readonly voiceDailyFlushService: VoiceDailyFlushService,
    private readonly presenter: MissionDiscordPresenter,
    private readonly discordAction: MissionDiscordActionService,
    @InjectRepository(VoiceDailyOrm)
    private readonly voiceDailyRepo: Repository<VoiceDailyOrm>,
    @InjectRepository(VoiceChannelHistoryOrm)
    private readonly voiceHistoryRepo: Repository<VoiceChannelHistoryOrm>,
  ) {}

  /**
   * 신규 멤버 가입 시 미션 레코드 생성.
   * NewbieMemberAddHandler.handleMemberJoin에서 호출된다.
   */
  async createMission(member: GuildMember, config: NewbieConfig): Promise<void> {
    if (!config.missionEnabled) return;
    if (!config.missionDurationDays || !config.missionTargetPlaytimeHours) {
      this.logger.warn(`[MISSION] Mission config incomplete: guild=${member.guild.id}`);
      return;
    }

    const hasMission = await this.missionRepo.hasMission(member.guild.id, member.id);
    if (hasMission) {
      this.logger.log(`[MISSION] Skipped duplicate: guild=${member.guild.id} member=${member.id}`);
      return;
    }

    const today = this.toDateString(new Date());
    const endDate = this.toDateString(
      new Date(Date.now() + config.missionDurationDays * 24 * 60 * 60 * 1000),
    );
    const targetPlaytimeSec = config.missionTargetPlaytimeHours * 3600;

    await this.missionRepo.create(
      member.guild.id,
      member.id,
      today,
      endDate,
      targetPlaytimeSec,
      member.displayName,
    );

    await this.newbieRedis.deleteMissionActive(member.guild.id);

    this.logger.log(
      `[MISSION] Created: guild=${member.guild.id} member=${member.id} end=${endDate}`,
    );

    if (config.missionNotifyChannelId) {
      await this.refreshMissionEmbed(member.guild.id, config).catch((err) => {
        this.logger.error(
          `[MISSION] Failed to refresh embed after create: guild=${member.guild.id}`,
          getErrorStack(err),
        );
      });
    }
  }

  /**
   * Bot → API HTTP 호출용 미션 생성.
   * GuildMember 객체 없이 guildId, memberId, displayName만으로 미션을 생성한다.
   */
  async createMissionFromBot(
    guildId: string,
    memberId: string,
    displayName: string,
  ): Promise<void> {
    const config = await this.configRepo.findByGuildId(guildId);
    if (!config?.missionEnabled) return;
    if (!config.missionDurationDays || !config.missionTargetPlaytimeHours) {
      this.logger.warn(`[MISSION] Mission config incomplete: guild=${guildId}`);
      return;
    }

    const hasMission = await this.missionRepo.hasMission(guildId, memberId);
    if (hasMission) {
      this.logger.log(`[MISSION] Skipped duplicate: guild=${guildId} member=${memberId}`);
      return;
    }

    const today = this.toDateString(new Date());
    const endDate = this.toDateString(
      new Date(Date.now() + config.missionDurationDays * 24 * 60 * 60 * 1000),
    );
    const targetPlaytimeSec = config.missionTargetPlaytimeHours * 3600;

    await this.missionRepo.create(
      guildId,
      memberId,
      today,
      endDate,
      targetPlaytimeSec,
      displayName,
    );

    await this.newbieRedis.deleteMissionActive(guildId);

    this.logger.log(
      `[MISSION] Created (bot-api): guild=${guildId} member=${memberId} end=${endDate}`,
    );

    if (config.missionNotifyChannelId) {
      void this.refreshMissionEmbed(guildId, config).catch((err) => {
        this.logger.error(
          `[MISSION] Failed to refresh embed after create: guild=${guildId}`,
          getErrorStack(err),
        );
      });
    }
  }

  /**
   * 미션 목록에 memberName, currentPlaytimeSec을 추가하여 반환.
   */
  async enrichMissions(
    guildId: string,
    missions: NewbieMission[],
  ): Promise<(NewbieMission & { memberName: string; currentPlaytimeSec: number })[]> {
    return Promise.all(
      missions.map(async (mission) => {
        const [memberName, currentPlaytimeSec] = await Promise.all([
          this.presenter.fetchMemberDisplayName(guildId, mission.memberId),
          this.getPlaytimeSec(guildId, mission.memberId, mission.startDate, mission.endDate),
        ]);
        // 서버 닉네임이 변경되었으면 DB에 저장하여 탈퇴 후에도 보존.
        // Embed 렌더링 결과에 영향 없으므로 응답 대기 없이 fire-and-forget 처리.
        if (memberName !== mission.memberName) {
          void this.missionRepo.updateMemberName(mission.id, memberName);
        }
        return { ...mission, memberName, currentPlaytimeSec };
      }),
    );
  }

  /**
   * 이력 미션에 currentPlaytimeSec을 추가한다.
   * memberName은 DB 값을 우선 사용하고, null인 경우에만 Discord에서 서버 닉네임을 조회한다.
   * 단, 서버에 없는 멤버(탈퇴)라면 fallback 이름을 DB에 저장하지 않는다.
   */
  async enrichHistoryMissions(
    guildId: string,
    missions: NewbieMission[],
  ): Promise<(NewbieMission & { memberName: string | null; currentPlaytimeSec: number })[]> {
    return Promise.all(
      missions.map(async (mission) => {
        const [memberName, currentPlaytimeSec] = await Promise.all([
          mission.memberName
            ? Promise.resolve(mission.memberName)
            : this.presenter.fetchMemberNickname(guildId, mission.memberId).then(async (name) => {
                if (name) {
                  await this.missionRepo.updateMemberName(mission.id, name);
                }
                return name;
              }),
          this.getPlaytimeSec(guildId, mission.memberId, mission.startDate, mission.endDate),
        ]);
        return { ...mission, memberName, currentPlaytimeSec };
      }),
    );
  }

  /**
   * 웹 대시보드 통합 조회 API용 enrichment.
   * Discord API를 호출하지 않고 DB에 저장된 memberName을 그대로 사용한다.
   * currentPlaytimeSec만 계산하여 추가한다.
   */
  async enrichMissionItems(
    guildId: string,
    missions: NewbieMission[],
  ): Promise<(NewbieMission & { memberName: string | null; currentPlaytimeSec: number })[]> {
    return Promise.all(
      missions.map(async (mission) => {
        const currentPlaytimeSec = await this.getPlaytimeSec(
          guildId,
          mission.memberId,
          mission.startDate,
          mission.endDate,
        );
        return { ...mission, memberName: mission.memberName, currentPlaytimeSec };
      }),
    );
  }

  /**
   * 기간 내 플레이타임 합산 (초 단위).
   */
  async getPlaytimeSec(
    guildId: string,
    memberId: string,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const result = await this.voiceDailyRepo
      .createQueryBuilder('vd')
      .select('COALESCE(SUM(vd.channelDurationSec), 0)', 'total')
      .where('vd.guildId = :guildId', { guildId })
      .andWhere('vd.userId = :memberId', { memberId })
      .andWhere('vd.date BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere("vd.channelId != 'GLOBAL'")
      .getRawOne<{ total: string }>();

    return parseInt(result?.total ?? '0', 10);
  }

  /**
   * 기간 내 플레이횟수 (VoiceChannelHistoryOrm 세션 수).
   */
  async getPlayCount(
    guildId: string,
    memberId: string,
    startDate: string,
    endDate: string,
    config: NewbieConfig,
  ): Promise<number> {
    const startDatetime = this.yyyymmddToKSTDate(startDate, 'start');
    const endDatetime = this.yyyymmddToKSTDate(endDate, 'end');

    const guildChannelRows = await this.voiceDailyRepo
      .createQueryBuilder('vd')
      .select('DISTINCT vd.channelId', 'channelId')
      .where('vd.guildId = :guildId', { guildId })
      .andWhere('vd.userId = :memberId', { memberId })
      .andWhere('vd.date BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere("vd.channelId != 'GLOBAL'")
      .getRawMany<{ channelId: string }>();

    const guildChannelIds = guildChannelRows.map((r) => r.channelId);
    if (guildChannelIds.length === 0) return 0;

    const rows = await this.voiceHistoryRepo
      .createQueryBuilder('vch')
      .select(['vch.joinedAt', 'vch.leftAt'])
      .innerJoin('vch.member', 'm')
      .innerJoin('vch.channel', 'c')
      .where('m.discordMemberId = :memberId', { memberId })
      .andWhere('c.discordChannelId IN (:...guildChannelIds)', { guildChannelIds })
      .andWhere('vch.joinedAt BETWEEN :startDatetime AND :endDatetime', {
        startDatetime,
        endDatetime,
      })
      .orderBy('vch.joinedAt', 'ASC')
      .getMany();

    if (config.playCountMinDurationMin === null && config.playCountIntervalMin === null) {
      return rows.length;
    }

    let sessions = rows;
    if (config.playCountMinDurationMin !== null) {
      const minMs = config.playCountMinDurationMin * 60 * 1000;
      sessions = sessions.filter((row) => {
        if (!row.leftAt) return false;
        return row.leftAt.getTime() - row.joinedAt.getTime() >= minMs;
      });
    }

    if (sessions.length === 0) return 0;

    if (config.playCountIntervalMin === null) {
      return sessions.length;
    }

    const intervalMs = config.playCountIntervalMin * 60 * 1000;
    let count = 1;
    let baseJoinedAt = sessions[0].joinedAt.getTime();

    for (let i = 1; i < sessions.length; i++) {
      const currentJoinedAt = sessions[i].joinedAt.getTime();
      if (currentJoinedAt - baseJoinedAt >= intervalMs) {
        count++;
        baseJoinedAt = currentJoinedAt;
      }
    }

    return count;
  }

  /**
   * 미션 현황 Embed를 알림 채널에 전송하거나 기존 메시지를 수정한다.
   */
  async refreshMissionEmbed(guildId: string, config?: NewbieConfig): Promise<void> {
    const resolvedConfig = config ?? (await this.configRepo.findByGuildId(guildId));
    if (!resolvedConfig?.missionEnabled || !resolvedConfig.missionNotifyChannelId) {
      return;
    }

    let missions = await this.missionRepo.findVisibleByGuild(guildId);
    missions = await this.removeInvalidMissions(guildId, missions);

    const statusCounts = await this.missionRepo.countByStatusForGuild(guildId);
    const missionItems = await this.buildMissionEmbedItems(guildId, missions, resolvedConfig);

    await this.presenter.refreshMissionEmbed(
      guildId,
      resolvedConfig,
      missions,
      statusCounts,
      missionItems,
    );
  }

  /**
   * 기존 미션 Embed 메시지를 삭제한다. Presenter에 위임.
   */
  async deleteEmbed(channelId: string, messageId: string): Promise<void> {
    await this.presenter.deleteEmbed(channelId, messageId);
  }

  /**
   * 갱신 버튼 클릭 시 호출.
   */
  async invalidateAndRefresh(guildId: string): Promise<void> {
    await this.voiceDailyFlushService.safeFlushAll();

    const activeMissions = await this.missionRepo.findActiveByGuild(guildId);
    for (const mission of activeMissions) {
      const playtimeSec = await this.getPlaytimeSec(
        guildId,
        mission.memberId,
        mission.startDate,
        mission.endDate,
      );
      if (playtimeSec >= mission.targetPlaytimeSec) {
        await this.missionRepo.updateStatus(mission.id, MissionStatus.COMPLETED);
        this.logger.log(
          `[MISSION] Completed on refresh: id=${mission.id} member=${mission.memberId} ` +
            `playtime=${playtimeSec}s target=${mission.targetPlaytimeSec}s`,
        );
      }
    }

    await this.newbieRedis.deleteMissionActive(guildId);
    await this.refreshMissionEmbed(guildId);
  }

  /**
   * 미션 수동 성공 처리 (F-NEWBIE-005).
   */
  async completeMission(
    guildId: string,
    missionId: number,
    roleId?: string | null,
  ): Promise<{ ok: true; warning?: string }> {
    const mission = await this.missionRepo.findById(missionId);
    if (!mission) throw new NotFoundException('미션을 찾을 수 없습니다.');
    if (mission.guildId !== guildId) throw new NotFoundException('미션을 찾을 수 없습니다.');
    if (mission.status !== MissionStatus.IN_PROGRESS) {
      throw new DomainException(
        '진행 중인 미션만 성공 처리할 수 있습니다.',
        'MISSION_NOT_IN_PROGRESS',
      );
    }

    await this.missionRepo.updateStatus(missionId, MissionStatus.COMPLETED);
    this.logger.log(`[MISSION] Manual complete: id=${missionId} member=${mission.memberId}`);

    // memberName 갱신
    const displayName = await this.discordAction.fetchMemberDisplayName(guildId, mission.memberId);
    if (displayName) await this.missionRepo.updateMemberName(missionId, displayName);

    let warning: string | undefined;
    if (roleId) {
      warning = await this.discordAction.grantRole(guildId, mission.memberId, roleId);
    }

    await this.newbieRedis.deleteMissionActive(guildId);
    await this.refreshMissionEmbed(guildId).catch((err) => {
      this.logger.error(`[MISSION] Embed refresh failed after complete`, getErrorStack(err));
    });

    return warning ? { ok: true, warning } : { ok: true };
  }

  /**
   * 미션 수동 실패 처리 (F-NEWBIE-005).
   */
  async failMission(
    guildId: string,
    missionId: number,
    kick?: boolean,
    dmReason?: string | null,
  ): Promise<{ ok: true; warning?: string }> {
    const mission = await this.missionRepo.findById(missionId);
    if (!mission) throw new NotFoundException('미션을 찾을 수 없습니다.');
    if (mission.guildId !== guildId) throw new NotFoundException('미션을 찾을 수 없습니다.');
    if (mission.status !== MissionStatus.IN_PROGRESS) {
      throw new DomainException(
        '진행 중인 미션만 실패 처리할 수 있습니다.',
        'MISSION_NOT_IN_PROGRESS',
      );
    }

    await this.missionRepo.updateStatus(missionId, MissionStatus.FAILED);
    this.logger.log(`[MISSION] Manual fail: id=${missionId} member=${mission.memberId}`);

    // memberName 갱신
    const displayName = await this.discordAction.fetchMemberDisplayName(guildId, mission.memberId);
    if (displayName) await this.missionRepo.updateMemberName(missionId, displayName);

    let warning: string | undefined;
    if (kick) {
      warning = await this.discordAction.sendDmAndKick(guildId, mission.memberId, dmReason);
    }

    await this.newbieRedis.deleteMissionActive(guildId);
    await this.refreshMissionEmbed(guildId).catch((err) => {
      this.logger.error(`[MISSION] Embed refresh failed after fail`, getErrorStack(err));
    });

    return warning ? { ok: true, warning } : { ok: true };
  }

  /**
   * 미션 Embed 숨김 처리 (F-NEWBIE-005).
   */
  async hideMission(guildId: string, missionId: number): Promise<void> {
    const mission = await this.missionRepo.findById(missionId);
    if (!mission) throw new NotFoundException('미션을 찾을 수 없습니다.');
    if (mission.guildId !== guildId) throw new NotFoundException('미션을 찾을 수 없습니다.');

    await this.missionRepo.updateHidden(missionId, true);
    this.logger.log(`[MISSION] Hidden from embed: id=${missionId} member=${mission.memberId}`);

    await this.newbieRedis.deleteMissionActive(guildId);
    await this.refreshMissionEmbed(guildId).catch((err) => {
      this.logger.error(`[MISSION] Embed refresh failed after hide`, getErrorStack(err));
    });
  }

  /**
   * hiddenFromEmbed = false로 갱신하여 Embed에 다시 표시한다.
   */
  async unhideMission(guildId: string, missionId: number): Promise<void> {
    const mission = await this.missionRepo.findById(missionId);
    if (!mission) throw new NotFoundException('미션을 찾을 수 없습니다.');
    if (mission.guildId !== guildId) throw new NotFoundException('미션을 찾을 수 없습니다.');

    await this.missionRepo.updateHidden(missionId, false);
    this.logger.log(`[MISSION] Unhidden from embed: id=${missionId} member=${mission.memberId}`);

    await this.newbieRedis.deleteMissionActive(guildId);
    await this.refreshMissionEmbed(guildId).catch((err) => {
      this.logger.error(`[MISSION] Embed refresh failed after unhide`, getErrorStack(err));
    });
  }

  /**
   * 가입일 기준 missionDurationDays 이내인데 미션이 없는 멤버를 자동 등록한다.
   */
  async registerMissingMembers(guildId: string, config: NewbieConfig): Promise<void> {
    if (!config.missionDurationDays || !config.missionTargetPlaytimeHours) return;

    const members = await this.discordAction.fetchGuildMembers(guildId);
    if (!members) return;

    const cutoff = Date.now() - config.missionDurationDays * 86_400_000;
    const memberIds = await this.missionRepo.findMemberIdsWithMission(guildId);
    const hasMission = new Set(memberIds);

    let created = 0;
    for (const member of members) {
      if (member.user.bot) continue;
      const joinedAt = member.joined_at ? new Date(member.joined_at) : null;
      if (!joinedAt || joinedAt.getTime() < cutoff) continue;
      const memberId = member.user.id;
      if (hasMission.has(memberId)) continue;

      const joinDate = this.toDateString(joinedAt);
      const endDate = this.toDateString(
        new Date(joinedAt.getTime() + config.missionDurationDays * 86_400_000),
      );
      const targetPlaytimeSec = config.missionTargetPlaytimeHours * 3600;

      await this.missionRepo.create(guildId, memberId, joinDate, endDate, targetPlaytimeSec);
      this.logger.log(
        `[MISSION] Auto-registered missing member: guild=${guildId} member=${memberId} joined=${joinDate}`,
      );
      created++;
    }

    if (created > 0) {
      await this.newbieRedis.deleteMissionActive(guildId);
    }
  }

  /**
   * 봇·나간 멤버의 미션을 정리한다.
   */
  private async removeInvalidMissions(
    guildId: string,
    missions: NewbieMission[],
  ): Promise<NewbieMission[]> {
    if (missions.length === 0) return missions;

    const valid: NewbieMission[] = [];
    let changed = 0;

    for (const mission of missions) {
      const { member, isConfirmedAbsent } = await this.discordAction.checkMemberExists(
        guildId,
        mission.memberId,
      );

      // 판단 불가(일시 오류) — 기존 상태 유지
      if (!member && !isConfirmedAbsent) {
        valid.push(mission);
        continue;
      }

      if (member?.user.bot) {
        await this.missionRepo.delete(mission.id);
        this.logger.log(
          `[MISSION] Deleted bot mission: id=${mission.id} member=${mission.memberId}`,
        );
        changed++;
        continue;
      }

      if (isConfirmedAbsent) {
        if (mission.status === MissionStatus.IN_PROGRESS) {
          await this.missionRepo.updateStatus(mission.id, MissionStatus.LEFT);
          this.logger.log(
            `[MISSION] Member left (IN_PROGRESS → LEFT): id=${mission.id} member=${mission.memberId}`,
          );
        }
        if (!mission.hiddenFromEmbed) {
          await this.missionRepo.updateHidden(mission.id, true);
        }
        changed++;
        continue;
      }

      valid.push(mission);
    }

    if (changed > 0) {
      await this.newbieRedis.deleteMissionActive(guildId);
    }

    return valid;
  }

  /**
   * Embed 렌더링에 필요한 미션별 데이터를 준비한다.
   */
  private async buildMissionEmbedItems(
    guildId: string,
    missions: NewbieMission[],
    config: NewbieConfig,
  ): Promise<MissionEmbedItem[]> {
    const items: MissionEmbedItem[] = [];
    for (const mission of missions) {
      const [playtimeSec, playCount] = await Promise.all([
        this.getPlaytimeSec(guildId, mission.memberId, mission.startDate, mission.endDate),
        this.getPlayCount(guildId, mission.memberId, mission.startDate, mission.endDate, config),
      ]);

      const username = await this.presenter.fetchMemberDisplayName(guildId, mission.memberId);

      items.push({
        username,
        mention: `<@${mission.memberId}>`,
        status: mission.status,
        startDate: this.formatDateYYYYMMDD(mission.startDate),
        endDate: this.formatDateYYYYMMDD(mission.endDate),
        playtimeSec,
        playCount,
        targetPlaytime: this.formatTargetPlaytime(mission.targetPlaytimeSec),
        daysLeft: this.calcDaysLeft(mission.endDate),
      });
    }
    return items;
  }

  private formatDateYYYYMMDD(yyyymmdd: string): string {
    const year = yyyymmdd.slice(0, 4);
    const month = yyyymmdd.slice(4, 6);
    const day = yyyymmdd.slice(6, 8);
    return `${year}-${month}-${day}`;
  }

  private formatTargetPlaytime(totalSec: number): string {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    if (m === 0) return `${h}시간`;
    return `${h}시간 ${m}분`;
  }

  private calcDaysLeft(endDate: string): number {
    const todayStr = this.toDateString(new Date());
    const todayDate = new Date(
      parseInt(todayStr.slice(0, 4), 10),
      parseInt(todayStr.slice(4, 6), 10) - 1,
      parseInt(todayStr.slice(6, 8), 10),
    );
    const endDateObj = new Date(
      parseInt(endDate.slice(0, 4), 10),
      parseInt(endDate.slice(4, 6), 10) - 1,
      parseInt(endDate.slice(6, 8), 10),
    );
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Math.floor((endDateObj.getTime() - todayDate.getTime()) / msPerDay);
    return Math.max(0, days);
  }

  private toDateString(date: Date): string {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10).replace(/-/g, '');
  }

  private yyyymmddToKSTDate(yyyymmdd: string, bound: 'start' | 'end'): Date {
    const year = parseInt(yyyymmdd.slice(0, 4), 10);
    const month = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
    const day = parseInt(yyyymmdd.slice(6, 8), 10);
    const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
    const utcBase = Date.UTC(year, month, day);
    if (bound === 'start') {
      return new Date(utcBase - KST_OFFSET_MS);
    }
    return new Date(utcBase - KST_OFFSET_MS + 24 * 60 * 60 * 1000 - 1);
  }
}
