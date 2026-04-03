import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VoiceChannelModule } from '../voice-channel.module';
import { CoPresenceScheduler } from './co-presence.scheduler';
import { CoPresenceService } from './co-presence.service';
import { CoPresenceAnalyticsController } from './co-presence-analytics.controller';
import { CoPresenceAnalyticsService } from './co-presence-analytics.service';
import { CoPresenceCleanupScheduler } from './co-presence-cleanup.scheduler';
import { CoPresenceDbRepository } from './co-presence-db.repository';
import { VoiceCoPresenceDailyOrm } from './infrastructure/voice-co-presence-daily.orm-entity';
import { VoiceCoPresencePairDailyOrm } from './infrastructure/voice-co-presence-pair-daily.orm-entity';
import { VoiceCoPresenceSessionOrm } from './infrastructure/voice-co-presence-session.orm-entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VoiceCoPresenceSessionOrm,
      VoiceCoPresenceDailyOrm,
      VoiceCoPresencePairDailyOrm,
    ]),
    VoiceChannelModule,
  ],
  controllers: [CoPresenceAnalyticsController],
  providers: [
    CoPresenceScheduler,
    CoPresenceService,
    CoPresenceDbRepository,
    CoPresenceCleanupScheduler,
    CoPresenceAnalyticsService,
  ],
  exports: [CoPresenceScheduler, CoPresenceService],
})
export class CoPresenceModule {}
