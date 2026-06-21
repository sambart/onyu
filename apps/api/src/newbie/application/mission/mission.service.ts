import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { VoiceDailyFlushService } from '../../../channel/voice/application/voice-daily-flush-service';
import { VoiceChannelHistoryOrm } from '../../../channel/voice/infrastructure/voice-channel-history.orm-entity';
import { VoiceDailyOrm } from '../../../channel/voice/infrastructure/voice-daily.orm-entity';
import { DomainException } from '../../../common/domain-exception';
import { getErrorStack } from '../../../common/util/error.util';
import { GuildMemberService } from '../../../guild-member/application/guild-member.service';
import { RedisService } from '../../../redis/redis.service';
import { MissionStatus } from '../../domain/newbie-mission.types';
import { NewbieKeys } from '../../infrastructure/newbie-cache.keys';
import { NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';
import { NewbieConfigRepository } from '../../infrastructure/newbie-config.repository';
import { NewbieMissionOrmEntity as NewbieMission } from '../../infrastructure/newbie-mission.orm-entity';
import { NewbieMissionRepository } from '../../infrastructure/newbie-mission.repository';
import { NewbieRedisRepository } from '../../infrastructure/newbie-redis.repository';
import type { MissionEmbedItem } from './mission-discord.presenter';
import { MissionDiscordPresenter } from './mission-discord.presenter';
import { MissionDiscordActionService } from './mission-discord-action.service';
import type { MissionCanvasConfig, MissionCanvasEntry } from './mission-rank.renderer';
import {
  MISSION_CANVAS_CACHE_TTL_SEC as CANVAS_CACHE_TTL_SEC,
  MissionRankRenderer,
} from './mission-rank.renderer';

/** createMission에서 필요한 Discord GuildMember 최소 인터페이스 */
interface DiscordGuildMemberLike {
  id: string;
  displayName: string;
  guild: { id: string };
}

/** 배치 플레이타임/플레이횟수 산정 입력 단위 */
interface MissionRange {
  key: number; // mission.id — 결과 매칭 키
  memberId: string;
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD
}

@Injectable()
export class MissionService {
  private readonly logger = new Logger(MissionService.name);

  // eslint-disable-next-line max-params
  constructor(
    private readonly missionRepo: NewbieMissionRepository,
    private readonly configRepo: NewbieConfigRepository,
    private readonly newbieRedis: NewbieRedisRepository,
    private readonly voiceDailyFlushService: VoiceDailyFlushService,
    private readonly presenter: MissionDiscordPresenter,
    private readonly discordAction: MissionDiscordActionService,
    private readonly renderer: MissionRankRenderer,
    private readonly redis: RedisService,
    private readonly guildMemberService: GuildMemberService,
    @InjectRepository(VoiceDailyOrm)
    private readonly voiceDailyRepo: Repository<VoiceDailyOrm>,
    @InjectRepository(VoiceChannelHistoryOrm)
    private readonly voiceHistoryRepo: Repository<VoiceChannelHistoryOrm>,
  ) {}

  /**
   * 신규 멤버 가입 시 미션 레코드 생성.
   * NewbieMemberAddHandler.handleMemberJoin에서 호출된다.
   */
  async createMission(member: DiscordGuildMemberLike, config: NewbieConfig): Promise<void> {
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
      config.missionTargetPlayCount,
    );

    await this.newbieRedis.deleteMissionActive(member.guild.id);
    await this.invalidateMissionCanvasCache(member.guild.id);

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
      config.missionTargetPlayCount,
    );

    await this.newbieRedis.deleteMissionActive(guildId);
    await this.invalidateMissionCanvasCache(guildId);

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
    const config = await this.configRepo.findByGuildId(guildId);
    const useMicTime = config?.missionUseMicTime ?? false;

    const playtimeMap = await this.batchGetPlaytimeSec(
      guildId,
      missions.map((m) => ({
        key: m.id,
        memberId: m.memberId,
        startDate: m.startDate,
        endDate: m.endDate,
      })),
      useMicTime,
    );

    return Promise.all(
      missions.map(async (mission) => {
        const memberName = await this.presenter.fetchMemberDisplayName(guildId, mission.memberId);
        // 서버 닉네임이 변경되었으면 DB에 저장하여 탈퇴 후에도 보존.
        // Embed 렌더링 결과에 영향 없으므로 응답 대기 없이 fire-and-forget 처리.
        if (memberName !== mission.memberName) {
          void this.missionRepo.updateMemberName(mission.id, memberName);
        }
        return { ...mission, memberName, currentPlaytimeSec: playtimeMap.get(mission.id) ?? 0 };
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
    const config = await this.configRepo.findByGuildId(guildId);
    const useMicTime = config?.missionUseMicTime ?? false;

    const playtimeMap = await this.batchGetPlaytimeSec(
      guildId,
      missions.map((m) => ({
        key: m.id,
        memberId: m.memberId,
        startDate: m.startDate,
        endDate: m.endDate,
      })),
      useMicTime,
    );

    return Promise.all(
      missions.map(async (mission) => {
        const memberName = await (mission.memberName
          ? Promise.resolve(mission.memberName)
          : this.presenter.fetchMemberNickname(guildId, mission.memberId).then(async (name) => {
              if (name) {
                await this.missionRepo.updateMemberName(mission.id, name);
              }
              return name;
            }));
        return { ...mission, memberName, currentPlaytimeSec: playtimeMap.get(mission.id) ?? 0 };
      }),
    );
  }

  /**
   * 웹 대시보드 통합 조회 API용 enrichment.
   * guild_member 닉네임을 우선 조회하고, 없으면 mission.memberName을 사용한다.
   */
  async enrichMissionItems(
    guildId: string,
    missions: NewbieMission[],
  ): Promise<(NewbieMission & { memberName: string | null; currentPlaytimeSec: number })[]> {
    const config = await this.configRepo.findByGuildId(guildId);
    const useMicTime = config?.missionUseMicTime ?? false;

    const playtimeMap = await this.batchGetPlaytimeSec(
      guildId,
      missions.map((m) => ({
        key: m.id,
        memberId: m.memberId,
        startDate: m.startDate,
        endDate: m.endDate,
      })),
      useMicTime,
    );

    return Promise.all(
      missions.map(async (mission) => {
        const memberName = await this.resolveMemberName(
          guildId,
          mission.memberId,
          mission.memberName,
        );
        return { ...mission, memberName, currentPlaytimeSec: playtimeMap.get(mission.id) ?? 0 };
      }),
    );
  }

  /**
   * 기간 내 플레이타임 합산 (초 단위).
   * @param useMicTime true면 micOnSec, false면 channelDurationSec를 합산한다.
   */
  async getPlaytimeSec(
    guildId: string,
    memberId: string,
    startDate: string,
    endDate: string,
    useMicTime = false,
  ): Promise<number> {
    const map = await this.batchGetPlaytimeSec(
      guildId,
      [{ key: 0, memberId, startDate, endDate }],
      useMicTime,
    );
    return map.get(0) ?? 0;
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
    const map = await this.batchGetPlayCount(
      guildId,
      [{ key: 0, memberId, startDate, endDate }],
      config,
    );
    return map.get(0) ?? 0;
  }

  /**
   * 미션 현황 Embed를 알림 채널에 전송하거나 기존 메시지를 수정한다.
   * missionDisplayMode가 'CANVAS'이면 Canvas 렌더링 경로로 분기한다.
   */
  async refreshMissionEmbed(guildId: string, config?: NewbieConfig): Promise<void> {
    const resolvedConfig = config ?? (await this.configRepo.findByGuildId(guildId));
    if (!resolvedConfig?.missionEnabled || !resolvedConfig.missionNotifyChannelId) {
      return;
    }

    // Canvas 모드 분기
    if (resolvedConfig.missionDisplayMode === 'CANVAS') {
      await this.refreshMissionCanvas(guildId, resolvedConfig);
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

    const config = await this.configRepo.findByGuildId(guildId);
    const activeMissions = await this.missionRepo.findActiveByGuild(guildId);

    const useMicTime = config?.missionUseMicTime ?? false;

    const ranges = activeMissions.map((m) => ({
      key: m.id,
      memberId: m.memberId,
      startDate: m.startDate,
      endDate: m.endDate,
    }));

    const playtimeMap = await this.batchGetPlaytimeSec(guildId, ranges, useMicTime);

    // playCount는 config가 있고 targetPlayCount !== null인 미션만 필요
    const countRanges = config
      ? ranges.filter((_, i) => activeMissions[i].targetPlayCount !== null)
      : [];
    const resolvedConfig = config;
    const playCountMap =
      countRanges.length > 0 && resolvedConfig
        ? await this.batchGetPlayCount(guildId, countRanges, resolvedConfig)
        : new Map<number, number>();

    for (const mission of activeMissions) {
      const playtimeSec = playtimeMap.get(mission.id) ?? 0;
      const playCount =
        mission.targetPlayCount !== null && config ? (playCountMap.get(mission.id) ?? 0) : 0;

      if (
        this.isMissionCompleted({
          playtimeSec,
          targetPlaytimeSec: mission.targetPlaytimeSec,
          playCount,
          targetPlayCount: mission.targetPlayCount,
        })
      ) {
        await this.missionRepo.updateStatus(mission.id, MissionStatus.COMPLETED);
        this.logger.log(
          `[MISSION] Completed on refresh: id=${mission.id} member=${mission.memberId} ` +
            `playtime=${playtimeSec}s target=${mission.targetPlaytimeSec}s ` +
            `playCount=${playCount} targetPlayCount=${mission.targetPlayCount}`,
        );
      }
    }

    await this.newbieRedis.deleteMissionActive(guildId);
    await this.invalidateMissionCanvasCache(guildId);
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
    await this.invalidateMissionCanvasCache(guildId);

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
    await this.invalidateMissionCanvasCache(guildId);
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
    await this.invalidateMissionCanvasCache(guildId);
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
    await this.invalidateMissionCanvasCache(guildId);
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
      // fetchGuildMembers()가 이미 봇을 제외하므로 isBot 체크 불필요
      const joinedAt = member.joinedAt;
      if (!joinedAt || joinedAt.getTime() < cutoff) continue;
      const memberId = member.userId;
      if (hasMission.has(memberId)) continue;

      const joinDate = this.toDateString(joinedAt);
      const endDate = this.toDateString(
        new Date(joinedAt.getTime() + config.missionDurationDays * 86_400_000),
      );
      const targetPlaytimeSec = config.missionTargetPlaytimeHours * 3600;

      await this.missionRepo.create(
        guildId,
        memberId,
        joinDate,
        endDate,
        targetPlaytimeSec,
        null,
        config.missionTargetPlayCount,
      );
      this.logger.log(
        `[MISSION] Auto-registered missing member: guild=${guildId} member=${memberId} joined=${joinDate}`,
      );
      created++;
    }

    if (created > 0) {
      await this.newbieRedis.deleteMissionActive(guildId);
      await this.invalidateMissionCanvasCache(guildId);
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

      if (member?.isBot) {
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
      await this.invalidateMissionCanvasCache(guildId);
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
    const useMicTime = config.missionUseMicTime;

    const ranges = missions.map((m) => ({
      key: m.id,
      memberId: m.memberId,
      startDate: m.startDate,
      endDate: m.endDate,
    }));

    const [playtimeMap, playCountMap] = await Promise.all([
      this.batchGetPlaytimeSec(guildId, ranges, useMicTime),
      this.batchGetPlayCount(guildId, ranges, config),
    ]);

    for (const mission of missions) {
      const playtimeSec = playtimeMap.get(mission.id) ?? 0;
      const playCount = playCountMap.get(mission.id) ?? 0;
      const username = await this.resolveMemberName(guildId, mission.memberId, mission.memberName);

      items.push({
        username,
        mention: `<@${mission.memberId}>`,
        status: mission.status,
        startDate: this.formatDateYYYYMMDD(mission.startDate),
        endDate: this.formatDateYYYYMMDD(mission.endDate),
        playtimeSec,
        playCount,
        targetPlaytime: this.formatTargetPlaytime(mission.targetPlaytimeSec),
        targetPlayCount: mission.targetPlayCount ?? config.missionTargetPlayCount,
        daysLeft: this.calcDaysLeft(mission.endDate),
      });
    }
    return items;
  }

  // ── Private: 배치 쿼리 ──

  /**
   * 여러 미션 범위에 대한 플레이타임을 1쿼리로 일괄 조회한다.
   * 결과는 MissionRange.key → 플레이타임(초) 맵으로 반환된다.
   */
  private async batchGetPlaytimeSec(
    guildId: string,
    ranges: MissionRange[],
    useMicTime = false,
  ): Promise<Map<number, number>> {
    if (ranges.length === 0) return new Map();

    const memberIds = [...new Set(ranges.map((r) => r.memberId))];
    const minStart = ranges.reduce(
      (acc, r) => (r.startDate < acc ? r.startDate : acc),
      ranges[0].startDate,
    );
    const maxEnd = ranges.reduce(
      (acc, r) => (r.endDate > acc ? r.endDate : acc),
      ranges[0].endDate,
    );

    // column은 내부 분기로만 결정되는 화이트리스트이므로 SQL injection 위험 없음
    const column = useMicTime ? 'micOnSec' : 'channelDurationSec';

    const rows = await this.voiceDailyRepo
      .createQueryBuilder('vd')
      .select('vd.userId', 'userId')
      .addSelect('vd.date', 'date')
      .addSelect(`COALESCE(SUM(vd.${column}), 0)`, 'total')
      .where('vd.guildId = :guildId', { guildId })
      .andWhere('vd.userId IN (:...memberIds)', { memberIds })
      .andWhere('vd.date BETWEEN :minStart AND :maxEnd', { minStart, maxEnd })
      .andWhere("vd.channelId != 'GLOBAL'")
      .groupBy('vd.userId')
      .addGroupBy('vd.date')
      .getRawMany<{ userId: string; date: string; total: string }>();

    // userId → (date → total) 인덱스 구성
    const byUserDate = new Map<string, Map<string, number>>();
    for (const row of rows) {
      let dateMap = byUserDate.get(row.userId);
      if (!dateMap) {
        dateMap = new Map();
        byUserDate.set(row.userId, dateMap);
      }
      dateMap.set(row.date, parseInt(row.total, 10));
    }

    // 미션별로 자기 범위만 재집계 (문자열 YYYYMMDD 사전식 비교 = 날짜순)
    const result = new Map<number, number>();
    for (const r of ranges) {
      const dateMap = byUserDate.get(r.memberId);
      result.set(r.key, this.sumByDateRange(dateMap, r.startDate, r.endDate));
    }
    return result;
  }

  /** userId 별 date→total 맵에서 [startDate, endDate] 범위 합산 (문자열 사전식 비교) */
  private sumByDateRange(
    dateMap: Map<string, number> | undefined,
    startDate: string,
    endDate: string,
  ): number {
    if (!dateMap) return 0;
    let sum = 0;
    for (const [date, total] of dateMap) {
      if (date >= startDate && date <= endDate) {
        sum += total;
      }
    }
    return sum;
  }

  /**
   * 여러 미션 범위에 대한 플레이횟수를 2쿼리로 일괄 조회한다.
   * 결과는 MissionRange.key → 플레이횟수 맵으로 반환된다.
   */
  // eslint-disable-next-line max-lines-per-function
  private async batchGetPlayCount(
    guildId: string,
    ranges: MissionRange[],
    config: NewbieConfig,
  ): Promise<Map<number, number>> {
    if (ranges.length === 0) return new Map();

    const memberIds = [...new Set(ranges.map((r) => r.memberId))];
    const minStart = ranges.reduce(
      (acc, r) => (r.startDate < acc ? r.startDate : acc),
      ranges[0].startDate,
    );
    const maxEnd = ranges.reduce(
      (acc, r) => (r.endDate > acc ? r.endDate : acc),
      ranges[0].endDate,
    );

    // ① distinct channels 배치 (voice_daily) — memberIds 전체 + 전 범위로 1쿼리
    const channelRows = await this.voiceDailyRepo
      .createQueryBuilder('vd')
      .select('vd.userId', 'userId')
      .addSelect('vd.channelId', 'channelId')
      .distinct(true)
      .where('vd.guildId = :guildId', { guildId })
      .andWhere('vd.userId IN (:...memberIds)', { memberIds })
      .andWhere('vd.date BETWEEN :minStart AND :maxEnd', { minStart, maxEnd })
      .andWhere("vd.channelId != 'GLOBAL'")
      .getRawMany<{ userId: string; channelId: string }>();

    // userId → Set<channelId>
    const channelsByMember = new Map<string, Set<string>>();
    for (const row of channelRows) {
      let channelSet = channelsByMember.get(row.userId);
      if (!channelSet) {
        channelSet = new Set();
        channelsByMember.set(row.userId, channelSet);
      }
      channelSet.add(row.channelId);
    }

    // 채널이 하나도 없으면 sessions 쿼리 스킵 → 전 미션 0
    const allChannelIds = [...new Set(channelRows.map((r) => r.channelId))];
    if (allChannelIds.length === 0) {
      const result = new Map<number, number>();
      for (const r of ranges) result.set(r.key, 0);
      return result;
    }

    // ② sessions 배치 (voice_history) — 전 memberIds × 전 채널 × 전 기간으로 1쿼리
    const minStartDatetime = this.yyyymmddToKSTDate(minStart, 'start');
    const maxEndDatetime = this.yyyymmddToKSTDate(maxEnd, 'end');

    const sessionRows = await this.voiceHistoryRepo
      .createQueryBuilder('vch')
      .select('gm.userId', 'userId')
      .addSelect('c.discordChannelId', 'channelId')
      .addSelect('vch.joinedAt', 'joinedAt')
      .addSelect('vch.leftAt', 'leftAt')
      .innerJoin('vch.guildMember', 'gm')
      .innerJoin('vch.channel', 'c')
      .where('gm.userId IN (:...memberIds)', { memberIds })
      .andWhere('c.discordChannelId IN (:...allChannelIds)', { allChannelIds })
      .andWhere('vch.joinedAt BETWEEN :minStartDatetime AND :maxEndDatetime', {
        minStartDatetime,
        maxEndDatetime,
      })
      .orderBy('vch.joinedAt', 'ASC')
      .getRawMany<{
        userId: string;
        channelId: string;
        joinedAt: Date | string;
        leftAt: Date | string | null;
      }>();

    // userId → 세션 배열 인덱싱 (joinedAt/leftAt Date 정규화 — getRawMany는 string으로 올 수 있음)
    const sessionsByMember = new Map<
      string,
      Array<{ channelId: string; joinedAt: Date; leftAt: Date | null }>
    >();
    for (const row of sessionRows) {
      let arr = sessionsByMember.get(row.userId);
      if (!arr) {
        arr = [];
        sessionsByMember.set(row.userId, arr);
      }
      arr.push({
        channelId: row.channelId,
        joinedAt: this.toDate(row.joinedAt),
        leftAt: row.leftAt === null ? null : this.toDate(row.leftAt),
      });
    }

    // ③ 미션별 JS 집계 — 기존 로직 100% 재사용 (countSessions)
    const result = new Map<number, number>();
    for (const r of ranges) {
      const memberChannels = channelsByMember.get(r.memberId);
      if (!memberChannels || memberChannels.size === 0) {
        result.set(r.key, 0);
        continue;
      }

      const startDt = this.yyyymmddToKSTDate(r.startDate, 'start');
      const endDt = this.yyyymmddToKSTDate(r.endDate, 'end');

      // 미션 범위 + 채널 필터 (전체 정렬 → 부분집합도 ASC 정렬 유지)
      const filtered = (sessionsByMember.get(r.memberId) ?? []).filter(
        (s) => memberChannels.has(s.channelId) && s.joinedAt >= startDt && s.joinedAt <= endDt,
      );

      result.set(r.key, this.countSessions(filtered, config));
    }
    return result;
  }

  /**
   * 기존 getPlayCount의 ③ JS 집계 로직 — 동작 보존을 위해 무손실 추출.
   * 단일·배치 모두 이 헬퍼를 공용한다.
   */
  private countSessions(
    rows: { joinedAt: Date; leftAt: Date | null }[],
    config: NewbieConfig,
  ): number {
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

    if (config.playCountIntervalMin === null) return sessions.length;

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
   * getRawMany에서 joinedAt/leftAt이 string으로 올 수 있으므로 Date로 정규화한다.
   */
  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
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

  /**
   * 미션 달성 여부를 판정한다.
   * targetPlayCount가 null이면 플레이타임만으로 판정(기존 동작).
   */
  private isMissionCompleted(params: {
    playtimeSec: number;
    targetPlaytimeSec: number;
    playCount: number;
    targetPlayCount: number | null;
  }): boolean {
    if (params.playtimeSec < params.targetPlaytimeSec) return false;
    if (params.targetPlayCount !== null && params.playCount < params.targetPlayCount) return false;
    return true;
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

  // ── Private: Canvas 모드 ──

  /**
   * Canvas 모드: 미션 현황을 PNG 이미지로 렌더링하여 전송/수정한다.
   */
  private async refreshMissionCanvas(guildId: string, config: NewbieConfig): Promise<void> {
    // 캐시 확인
    const cacheKey = NewbieKeys.missionCanvasPage(guildId, 1);
    const cached = await this.redis.getBuffer(cacheKey);
    if (cached) {
      await this.presenter.sendOrUpdateCanvasMission(config, guildId, cached);
      return;
    }

    let missions = await this.missionRepo.findVisibleByGuild(guildId);
    missions = await this.removeInvalidMissions(guildId, missions);

    const statusCounts = await this.missionRepo.countByStatusForGuild(guildId);
    const missionItems = await this.buildMissionEmbedItems(guildId, missions, config);

    const canvasConfig = this.buildMissionCanvasConfig(config, missions.length, statusCounts);
    const canvasData = this.toMissionCanvasData(missionItems);
    const buffer = await this.renderer.renderAll(canvasData, canvasConfig);

    await this.redis.setBuffer(cacheKey, buffer, CANVAS_CACHE_TTL_SEC);
    await this.presenter.sendOrUpdateCanvasMission(config, guildId, buffer);
  }

  private buildMissionCanvasConfig(
    config: NewbieConfig,
    totalCount: number,
    statusCounts: Record<string, number>,
  ): MissionCanvasConfig {
    const targetHours = config.missionTargetPlaytimeHours ?? 0;
    const targetMinutes = (targetHours * 60) % 60;
    const targetPlaytimeText =
      targetMinutes === 0 ? `${targetHours}시간` : `${targetHours}시간 ${targetMinutes}분`;

    return {
      totalCount,
      statusCounts,
      targetPlaytimeText,
      targetPlayCountText:
        config.missionTargetPlayCount === null ? null : `${config.missionTargetPlayCount}회`,
      updatedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    };
  }

  private toMissionCanvasData(items: MissionEmbedItem[]): { entries: MissionCanvasEntry[] } {
    return {
      entries: items.map((item) => ({
        nickname: item.username,
        period: `${this.formatMMDD(item.startDate)}~${this.formatMMDD(item.endDate)}`,
        // MissionEmbedItem.status는 string이지만 DB 값은 항상 MissionStatus 열거형 중 하나이므로 안전하다
        status: item.status as MissionStatus,
        statusEmoji: this.getStatusEmoji(item.status),
        statusText: this.getStatusText(item.status),
        playtimeSec: item.playtimeSec,
        targetPlaytimeSec: this.parseTargetPlaytimeSec(item.targetPlaytime),
        playCount: item.playCount,
        targetPlayCount: item.targetPlayCount,
        daysLeft: item.daysLeft,
      })),
    };
  }

  /**
   * 해당 길드의 미션 Canvas 캐시를 전체 삭제한다.
   * 미션 상태 변경, config 저장 시 호출한다.
   */
  async invalidateMissionCanvasCache(guildId: string): Promise<void> {
    await this.redis.deleteByPattern(NewbieKeys.missionCanvasPattern(guildId));
  }

  /**
   * 멤버 표시 이름을 조회한다.
   * 우선순위: guild_member.nick → guild_member.displayName → missionMemberName → User-{id}
   */
  private async resolveMemberName(
    guildId: string,
    memberId: string,
    missionMemberName: string | null,
  ): Promise<string> {
    const member = await this.guildMemberService.findByUserId(guildId, memberId);
    if (member?.nick) return member.nick;
    if (member?.displayName) return member.displayName;
    if (missionMemberName) return missionMemberName;
    return `User-${memberId.slice(0, 6)}`;
  }

  private formatMMDD(dateStr: string): string {
    return dateStr.slice(5);
  }

  private getStatusEmoji(status: string): string {
    const map: Record<string, string> = {
      IN_PROGRESS: '🟡',
      COMPLETED: '✅',
      FAILED: '❌',
      LEFT: '🚪',
    };
    return map[status] ?? '❓';
  }

  private getStatusText(status: string): string {
    const map: Record<string, string> = {
      IN_PROGRESS: '진행',
      COMPLETED: '완료',
      FAILED: '실패',
      LEFT: '퇴장',
    };
    return map[status] ?? '?';
  }

  /** "20시간" 또는 "20시간 30분" -> 초 단위 변환 */
  private parseTargetPlaytimeSec(targetPlaytime: string): number {
    const hourMatch = targetPlaytime.match(/(\d+)시간/u);
    const minMatch = targetPlaytime.match(/(\d+)분/u);
    const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
    const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
    return hours * 3600 + minutes * 60;
  }
}
