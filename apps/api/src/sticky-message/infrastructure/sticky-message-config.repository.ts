import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { StickyMessageSaveDto } from '../dto/sticky-message-save.dto';
import { StickyMessageConfigOrm } from './sticky-message-config.orm-entity';

@Injectable()
export class StickyMessageConfigRepository {
  constructor(
    @InjectRepository(StickyMessageConfigOrm)
    private readonly configRepo: Repository<StickyMessageConfigOrm>,
  ) {}

  /** guildId로 전체 설정 목록 조회 (sortOrder ASC). 캐시 미스 워밍업 및 슬래시 커맨드용. */
  async findByGuildId(guildId: string): Promise<StickyMessageConfigOrm[]> {
    return this.configRepo.find({
      where: { guildId },
      order: { sortOrder: 'ASC' },
    });
  }

  /** guildId + channelId로 활성 설정 목록 조회 (enabled=true, sortOrder ASC). 디바운스 만료 후 재전송용. */
  async findByGuildAndChannel(
    guildId: string,
    channelId: string,
  ): Promise<StickyMessageConfigOrm[]> {
    return this.configRepo.find({
      where: { guildId, channelId, enabled: true },
      order: { sortOrder: 'ASC' },
    });
  }

  /** id로 단건 조회. 삭제 시 messageId, channelId 확인용. */
  async findById(id: number): Promise<StickyMessageConfigOrm | null> {
    return this.configRepo.findOne({ where: { id } });
  }

  /**
   * 설정 저장 (id 기준 upsert):
   *   - id 없으면 신규 생성 (INSERT)
   *   - id 있으면 기존 레코드 갱신 (UPDATE)
   *   - messageId는 건드리지 않음 (updateMessageId()로만 변경)
   */
  async save(guildId: string, dto: StickyMessageSaveDto): Promise<StickyMessageConfigOrm> {
    if (dto.id == null) {
      const entity = this.configRepo.create({
        guildId,
        channelId: dto.channelId,
        embedTitle: dto.embedTitle ?? null,
        embedDescription: dto.embedDescription ?? null,
        embedColor: dto.embedColor ?? null,
        enabled: dto.enabled,
        sortOrder: dto.sortOrder,
        messageId: null,
      });
      return this.configRepo.save(entity);
    }

    const entity = await this.configRepo.findOne({ where: { id: dto.id } });
    if (!entity) {
      throw new NotFoundException(`StickyMessageConfig id=${dto.id} not found`);
    }

    entity.channelId = dto.channelId;
    entity.embedTitle = dto.embedTitle ?? null;
    entity.embedDescription = dto.embedDescription ?? null;
    entity.embedColor = dto.embedColor ?? null;
    entity.enabled = dto.enabled;
    entity.sortOrder = dto.sortOrder;

    return this.configRepo.save(entity);
  }

  /** Discord 메시지 ID 갱신. 전송 후 호출. */
  async updateMessageId(id: number, messageId: string): Promise<void> {
    await this.configRepo.update({ id }, { messageId });
  }

  /** Discord 메시지 ID + 반영 시각 동시 갱신. 전송 성공 직후 호출. */
  async updateMessageIdAndStamp(id: number, messageId: string, appliedAt: Date): Promise<void> {
    await this.configRepo.update({ id }, { messageId, lastAppliedAt: appliedAt });
  }

  /** 단건 삭제. */
  async delete(id: number): Promise<void> {
    await this.configRepo.delete({ id });
  }

  /** 채널 내 전체 설정 삭제. 슬래시 커맨드 /고정메세지삭제용. */
  async deleteByGuildAndChannel(guildId: string, channelId: string): Promise<void> {
    await this.configRepo.delete({ guildId, channelId });
  }
}
