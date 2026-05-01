import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { NewbieConfigSaveDto } from '../presentation/dto/newbie-config-save.dto';
import { NewbieConfigOrmEntity as NewbieConfig } from './newbie-config.orm-entity';

@Injectable()
export class NewbieConfigRepository {
  constructor(
    @InjectRepository(NewbieConfig)
    private readonly repo: Repository<NewbieConfig>,
  ) {}

  /** guildId로 설정 단건 조회 */
  async findByGuildId(guildId: string): Promise<NewbieConfig | null> {
    return this.repo.findOne({ where: { guildId } });
  }

  /**
   * 설정 생성 또는 갱신 (guildId 기준).
   * missionNotifyMessageId, mocoRankMessageId는 건드리지 않는다.
   */
  async upsert(guildId: string, dto: NewbieConfigSaveDto): Promise<NewbieConfig> {
    const existing = await this.repo.findOne({ where: { guildId } });
    const config = existing
      ? this.applyDtoToEntity(existing, dto)
      : this.createEntityFromDto(guildId, dto);

    return this.repo.save(config);
  }

  /** 기존 엔티티에 DTO 값을 덮어씌운다 (메시지 ID 필드 보존). */
  private applyDtoToEntity(config: NewbieConfig, dto: NewbieConfigSaveDto): NewbieConfig {
    config.welcomeEnabled = dto.welcomeEnabled;
    config.welcomeChannelId = dto.welcomeChannelId ?? null;
    config.welcomeEmbedTitle = dto.welcomeEmbedTitle ?? null;
    config.welcomeEmbedDescription = dto.welcomeEmbedDescription ?? null;
    config.welcomeEmbedColor = dto.welcomeEmbedColor ?? null;
    config.welcomeEmbedThumbnailUrl = dto.welcomeEmbedThumbnailUrl ?? null;
    config.welcomeContent = dto.welcomeContent ?? null;
    config.missionEnabled = dto.missionEnabled;
    config.missionDurationDays = dto.missionDurationDays ?? null;
    config.missionTargetPlaytimeHours = dto.missionTargetPlaytimeHours ?? null;
    config.missionUseMicTime = dto.missionUseMicTime ?? false;
    config.missionTargetPlayCount = dto.missionTargetPlayCount ?? null;
    config.playCountMinDurationMin = dto.playCountMinDurationMin ?? null;
    config.playCountIntervalMin = dto.playCountIntervalMin ?? null;
    config.missionNotifyChannelId = dto.missionNotifyChannelId ?? null;
    config.missionEmbedTitle = dto.missionEmbedTitle ?? null;
    config.missionEmbedDescription = dto.missionEmbedDescription ?? null;
    config.missionEmbedColor = dto.missionEmbedColor ?? null;
    config.missionEmbedThumbnailUrl = dto.missionEmbedThumbnailUrl ?? null;
    config.missionDisplayMode = dto.missionDisplayMode ?? 'EMBED';
    config.mocoEnabled = dto.mocoEnabled;
    config.mocoNewbieDays = dto.mocoNewbieDays ?? 30;
    config.mocoAllowNewbieHunter = dto.mocoAllowNewbieHunter ?? false;
    config.mocoRankChannelId = dto.mocoRankChannelId ?? null;
    config.mocoAutoRefreshMinutes = dto.mocoAutoRefreshMinutes ?? null;
    config.mocoEmbedTitle = dto.mocoEmbedTitle ?? null;
    config.mocoEmbedDescription = dto.mocoEmbedDescription ?? null;
    config.mocoEmbedColor = dto.mocoEmbedColor ?? null;
    config.mocoEmbedThumbnailUrl = dto.mocoEmbedThumbnailUrl ?? null;
    config.mocoPlayCountMinDurationMin = dto.mocoPlayCountMinDurationMin ?? null;
    config.mocoPlayCountIntervalMin = dto.mocoPlayCountIntervalMin ?? null;
    config.mocoMinCoPresenceMin = dto.mocoMinCoPresenceMin ?? 10;
    config.mocoScorePerSession = dto.mocoScorePerSession ?? 10;
    config.mocoScorePerMinute = dto.mocoScorePerMinute ?? 1;
    config.mocoScorePerUnique = dto.mocoScorePerUnique ?? 5;
    config.mocoDisplayMode = dto.mocoDisplayMode ?? 'EMBED';
    config.mocoResetPeriod = dto.mocoResetPeriod ?? 'NONE';
    config.mocoResetIntervalDays = dto.mocoResetIntervalDays ?? null;
    config.roleEnabled = dto.roleEnabled;
    config.roleDurationDays = dto.roleDurationDays ?? null;
    config.newbieRoleId = dto.newbieRoleId ?? null;
    return config;
  }

  /** DTO로부터 신규 엔티티를 생성한다. */
  private createEntityFromDto(guildId: string, dto: NewbieConfigSaveDto): NewbieConfig {
    return this.repo.create({
      guildId,
      welcomeEnabled: dto.welcomeEnabled,
      welcomeChannelId: dto.welcomeChannelId ?? null,
      welcomeEmbedTitle: dto.welcomeEmbedTitle ?? null,
      welcomeEmbedDescription: dto.welcomeEmbedDescription ?? null,
      welcomeEmbedColor: dto.welcomeEmbedColor ?? null,
      welcomeEmbedThumbnailUrl: dto.welcomeEmbedThumbnailUrl ?? null,
      welcomeContent: dto.welcomeContent ?? null,
      missionEnabled: dto.missionEnabled,
      missionDurationDays: dto.missionDurationDays ?? null,
      missionTargetPlaytimeHours: dto.missionTargetPlaytimeHours ?? null,
      missionUseMicTime: dto.missionUseMicTime ?? false,
      missionTargetPlayCount: dto.missionTargetPlayCount ?? null,
      playCountMinDurationMin: dto.playCountMinDurationMin ?? null,
      playCountIntervalMin: dto.playCountIntervalMin ?? null,
      missionNotifyChannelId: dto.missionNotifyChannelId ?? null,
      missionNotifyMessageId: null,
      missionEmbedTitle: dto.missionEmbedTitle ?? null,
      missionEmbedDescription: dto.missionEmbedDescription ?? null,
      missionEmbedColor: dto.missionEmbedColor ?? null,
      missionEmbedThumbnailUrl: dto.missionEmbedThumbnailUrl ?? null,
      missionDisplayMode: dto.missionDisplayMode ?? 'EMBED',
      mocoEnabled: dto.mocoEnabled,
      mocoNewbieDays: dto.mocoNewbieDays ?? 30,
      mocoAllowNewbieHunter: dto.mocoAllowNewbieHunter ?? false,
      mocoRankChannelId: dto.mocoRankChannelId ?? null,
      mocoRankMessageId: null,
      mocoAutoRefreshMinutes: dto.mocoAutoRefreshMinutes ?? null,
      mocoEmbedTitle: dto.mocoEmbedTitle ?? null,
      mocoEmbedDescription: dto.mocoEmbedDescription ?? null,
      mocoEmbedColor: dto.mocoEmbedColor ?? null,
      mocoEmbedThumbnailUrl: dto.mocoEmbedThumbnailUrl ?? null,
      mocoPlayCountMinDurationMin: dto.mocoPlayCountMinDurationMin ?? null,
      mocoPlayCountIntervalMin: dto.mocoPlayCountIntervalMin ?? null,
      mocoMinCoPresenceMin: dto.mocoMinCoPresenceMin ?? 10,
      mocoScorePerSession: dto.mocoScorePerSession ?? 10,
      mocoScorePerMinute: dto.mocoScorePerMinute ?? 1,
      mocoScorePerUnique: dto.mocoScorePerUnique ?? 5,
      mocoDisplayMode: dto.mocoDisplayMode ?? 'EMBED',
      mocoResetPeriod: dto.mocoResetPeriod ?? 'NONE',
      mocoResetIntervalDays: dto.mocoResetIntervalDays ?? null,
      roleEnabled: dto.roleEnabled,
      roleDurationDays: dto.roleDurationDays ?? null,
      newbieRoleId: dto.newbieRoleId ?? null,
    });
  }

  /** 미션 현황 Embed 메시지 ID 갱신 */
  async updateMissionNotifyMessageId(guildId: string, messageId: string | null): Promise<void> {
    await this.repo.update({ guildId }, { missionNotifyMessageId: messageId });
  }

  /** 모코코 사냥 순위 Embed 메시지 ID 갱신 */
  async updateMocoRankMessageId(guildId: string, messageId: string | null): Promise<void> {
    await this.repo.update({ guildId }, { mocoRankMessageId: messageId });
  }

  /** 모코코 사냥이 활성화된 모든 설정 조회 */
  async findAllMocoEnabled(): Promise<NewbieConfig[]> {
    return this.repo.find({ where: { mocoEnabled: true } });
  }

  /** 모코코 사냥 현재 기간 시작일 갱신 */
  async updateMocoCurrentPeriodStart(guildId: string, periodStart: string): Promise<void> {
    await this.repo.update({ guildId }, { mocoCurrentPeriodStart: periodStart });
  }
}
