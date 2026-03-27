export class VoiceDailyRecordDto {
  guildId: string;
  userId: string;
  userName: string;
  date: string;
  channelId: string;
  channelName: string;
  categoryId: string | null;
  categoryName: string | null;
  channelDurationSec: number;
  micOnSec: number;
  micOffSec: number;
  aloneSec: number;
  channelType: 'permanent' | 'auto_select' | 'auto_instant';
  autoChannelConfigId: number | null;
  autoChannelConfigName: string | null;
}
