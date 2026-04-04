import { Injectable } from '@nestjs/common';

import { VoiceDailyRecordDto } from '../dto/voice-daily-record.dto';
import { VoiceDailyRepository } from '../infrastructure/voice-daily.repository';

@Injectable()
export class VoiceDailyService {
  constructor(private readonly voiceDailyRepository: VoiceDailyRepository) {}

  async getDailyRecords(
    guildId: string,
    from: string,
    to: string,
    userId?: string,
    timezone?: string,
  ): Promise<VoiceDailyRecordDto[]> {
    const entities = await this.voiceDailyRepository.findByGuildIdAndDateRange(
      guildId,
      from,
      to,
      userId,
      timezone,
    );
    return entities.map((e) => ({
      guildId: e.guildId,
      userId: e.userId,
      userName: e.userName,
      date: e.date,
      channelId: e.channelId,
      channelName: e.channelName,
      categoryId: e.categoryId ?? null,
      categoryName: e.categoryName ?? null,
      channelDurationSec: e.channelDurationSec,
      micOnSec: e.micOnSec,
      micOffSec: e.micOffSec,
      aloneSec: e.aloneSec,
      channelType: e.channelType ?? 'permanent',
      autoChannelConfigId: e.autoChannelConfigId ?? null,
      autoChannelConfigName: e.autoChannelConfigName ?? null,
      autoChannelButtonId: e.autoChannelButtonId ?? null,
      autoChannelButtonLabel: e.autoChannelButtonLabel ?? null,
    }));
  }
}
