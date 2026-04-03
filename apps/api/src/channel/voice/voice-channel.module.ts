import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VoiceAnalyticsModule } from '../../voice-analytics/voice-analytics.module';
import { ChannelModule } from '../channel.module';
import { DataDeletionService } from './application/data-deletion.service';
import { MeProfileService } from './application/me-profile.service';
import { MemberSearchService } from './application/member-search.service';
import { ProfileCardRenderer } from './application/profile-card-renderer';
import { VoiceChannelPolicy } from './application/voice-channel.policy';
import { VoiceChannelService } from './application/voice-channel.service';
import { VoiceChannelHistoryService } from './application/voice-channel-history.service';
import { VoiceDailyService } from './application/voice-daily.service';
import { VoiceDailyFlushService } from './application/voice-daily-flush-service';
import { VoiceDataRetentionScheduler } from './application/voice-data-retention.scheduler';
import { VoiceExcludedChannelService } from './application/voice-excluded-channel.service';
import { VoiceGameService } from './application/voice-game.service';
import { VoiceHistoryService } from './application/voice-history.service';
import { VoiceRecoveryService } from './application/voice-recovery.service';
import { VoiceSessionService } from './application/voice-session.service';
import { VoiceStatsQueryService } from './application/voice-stats-query.service';
import { VoiceTempChannelService } from './application/voice-temp-channel.service';
import { VoiceCoPresencePairDailyOrm } from './co-presence/infrastructure/voice-co-presence-pair-daily.orm-entity';
import { DiscordVoiceGateway } from './infrastructure/discord-voice.gateway';
import { RedisTempChannelStore } from './infrastructure/redis-temp-channel-store';
import { VoiceChannelHistoryOrm } from './infrastructure/voice-channel-history.orm-entity';
import { VoiceDailyOrm } from './infrastructure/voice-daily.orm-entity';
import { VoiceDailyRepository } from './infrastructure/voice-daily.repository';
import { VoiceExcludedChannelOrm } from './infrastructure/voice-excluded-channel.orm-entity';
import { VoiceExcludedChannelRepository } from './infrastructure/voice-excluded-channel.repository';
import { VoiceGameActivityOrm } from './infrastructure/voice-game-activity.orm-entity';
import { VoiceGameDailyOrm } from './infrastructure/voice-game-daily.orm-entity';
import { VoiceGameDbRepository } from './infrastructure/voice-game-db.repository';
import { VoiceGameRedisRepository } from './infrastructure/voice-game-redis.repository';
import { VoiceRedisRepository } from './infrastructure/voice-redis.repository';
import { DataDeletionController } from './presentation/data-deletion.controller';
import { MemberSearchController } from './presentation/member-search.controller';
import { VoiceDailyController } from './presentation/voice-daily.controller';
import { VoiceExcludedChannelController } from './presentation/voice-excluded-channel.controller';
import { VoiceHistoryController } from './presentation/voice-history.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VoiceChannelHistoryOrm,
      VoiceDailyOrm,
      VoiceExcludedChannelOrm,
      VoiceCoPresencePairDailyOrm,
      VoiceGameActivityOrm,
      VoiceGameDailyOrm,
    ]),
    ChannelModule,
    forwardRef(() => VoiceAnalyticsModule),
  ],
  controllers: [
    VoiceExcludedChannelController,
    VoiceDailyController,
    MemberSearchController,
    VoiceHistoryController,
    DataDeletionController,
  ],
  providers: [
    VoiceChannelService,
    VoiceSessionService,
    VoiceTempChannelService,
    VoiceChannelHistoryService,
    VoiceChannelPolicy,
    DiscordVoiceGateway,
    {
      provide: 'TempChannelStore',
      useClass: RedisTempChannelStore,
    },
    VoiceRedisRepository,
    VoiceDailyRepository,
    VoiceDailyFlushService,
    VoiceRecoveryService,
    VoiceStatsQueryService,
    MeProfileService,
    ProfileCardRenderer,
    VoiceExcludedChannelRepository,
    VoiceExcludedChannelService,
    VoiceDailyService,
    MemberSearchService,
    VoiceHistoryService,
    VoiceDataRetentionScheduler,
    DataDeletionService,
    VoiceGameService,
    VoiceGameRedisRepository,
    VoiceGameDbRepository,
  ],
  exports: [
    VoiceChannelService,
    VoiceSessionService,
    VoiceDailyFlushService,
    VoiceRedisRepository,
    DiscordVoiceGateway,
    TypeOrmModule,
    VoiceExcludedChannelService,
    MeProfileService,
    ProfileCardRenderer,
    VoiceGameService,
    VoiceDailyService,
    VoiceRecoveryService,
  ],
})
export class VoiceChannelModule {}
