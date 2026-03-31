import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { MusicChannelConfigSaveDto } from '../dto/music-channel-config.dto';
import { MusicChannelConfigOrm } from './music-channel-config.orm-entity';

@Injectable()
export class MusicChannelConfigRepository {
  constructor(
    @InjectRepository(MusicChannelConfigOrm)
    private readonly repo: Repository<MusicChannelConfigOrm>,
  ) {}

  /** guildId로 단건 조회 (UNIQUE 제약). */
  async findByGuildId(guildId: string): Promise<MusicChannelConfigOrm | null> {
    return this.repo.findOne({ where: { guildId } });
  }

  /**
   * 설정 저장 (guildId 기준 upsert — 길드당 1개).
   * messageId는 건드리지 않음 (updateMessageId()로만 변경).
   */
  async save(guildId: string, dto: MusicChannelConfigSaveDto): Promise<MusicChannelConfigOrm> {
    const existing = await this.repo.findOne({ where: { guildId } });

    if (!existing) {
      const entity = this.repo.create({
        guildId,
        channelId: dto.channelId,
        embedTitle: dto.embedTitle ?? null,
        embedDescription: dto.embedDescription ?? null,
        embedColor: dto.embedColor ?? null,
        embedThumbnailUrl: dto.embedThumbnailUrl ?? null,
        buttonConfig: dto.buttonConfig,
        enabled: dto.enabled,
        messageId: null,
      });
      return this.repo.save(entity);
    }

    existing.channelId = dto.channelId;
    existing.embedTitle = dto.embedTitle ?? null;
    existing.embedDescription = dto.embedDescription ?? null;
    existing.embedColor = dto.embedColor ?? null;
    existing.embedThumbnailUrl = dto.embedThumbnailUrl ?? null;
    existing.buttonConfig = dto.buttonConfig;
    existing.enabled = dto.enabled;

    return this.repo.save(existing);
  }

  /** messageId 갱신 (임베드 전송/수정 후 호출). */
  async updateMessageId(id: number, messageId: string | null): Promise<void> {
    await this.repo.update({ id }, { messageId });
  }

  /** 설정 삭제. */
  async delete(guildId: string): Promise<void> {
    await this.repo.delete({ guildId });
  }

  /** channelId로 설정 조회 (메시지 리스너에서 채널 확인용). */
  async findByChannelId(channelId: string): Promise<MusicChannelConfigOrm | null> {
    return this.repo.findOne({ where: { channelId } });
  }
}
