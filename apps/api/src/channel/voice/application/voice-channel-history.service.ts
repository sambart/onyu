import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';

import { GuildMemberOrmEntity } from '../../../guild-member/infrastructure/guild-member.orm-entity';
import { ChannelOrm } from '../../infrastructure/channel.orm-entity';
import { VoiceChannelHistoryOrm } from '../infrastructure/voice-channel-history.orm-entity';

@Injectable()
export class VoiceChannelHistoryService {
  private readonly logger = new Logger(VoiceChannelHistoryService.name);

  constructor(
    @InjectRepository(VoiceChannelHistoryOrm)
    private readonly voiceChannelHistoryRepository: Repository<VoiceChannelHistoryOrm>,
    private readonly dataSource: DataSource,
  ) {}

  async logJoin(
    guildMember: GuildMemberOrmEntity,
    channel: ChannelOrm,
  ): Promise<VoiceChannelHistoryOrm> {
    const log = this.voiceChannelHistoryRepository.create({
      guildMember,
      channel,
      joinedAt: new Date(),
    });
    return this.voiceChannelHistoryRepository.save(log);
  }

  async logLeave(guildMember: GuildMemberOrmEntity, channel: ChannelOrm): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const log = await manager
        .createQueryBuilder()
        .select('id')
        .from(VoiceChannelHistoryOrm, 'log')
        .where('log.guildMemberId = :guildMemberId', { guildMemberId: guildMember.id })
        .andWhere('log.channelId = :channelId', { channelId: channel.id })
        .andWhere('log.leftAt IS NULL')
        .orderBy('log.joinedAt', 'DESC')
        .limit(1)
        .getRawOne();

      if (log) {
        await manager.update(VoiceChannelHistoryOrm, { id: log.id }, { leftAt: new Date() });
      }
    });
  }

  /** leftAt IS NULL인 고아 레코드를 일괄 종료한다 (F-VOICE-023) */
  async closeOrphanRecords(): Promise<number> {
    const result = await this.voiceChannelHistoryRepository
      .createQueryBuilder()
      .update(VoiceChannelHistoryOrm)
      .set({ leftAt: () => 'NOW()' })
      .where({ leftAt: IsNull() })
      .execute();

    const affected = result.affected ?? 0;
    if (affected > 0) {
      this.logger.warn(`Closed ${affected} orphan VoiceChannelHistoryOrm record(s)`);
    }
    return affected;
  }
}
