import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { VoiceCoPresencePairDailyOrm } from '../channel/voice/co-presence/infrastructure/voice-co-presence-pair-daily.orm-entity';
import { VoiceDailyOrm } from '../channel/voice/infrastructure/voice-daily.orm-entity';
import { VoiceRedisRepository } from '../channel/voice/infrastructure/voice-redis.repository';
import { LlmModule } from '../common/llm/llm.module';
import { GatewayModule } from '../gateway/gateway.module';
import { MocoHuntingDailyOrmEntity as MocoHuntingDaily } from '../newbie/infrastructure/moco-hunting-daily.orm-entity';
import { VoiceAiAnalysisService } from './application/voice-ai-analysis.service';
import { VoiceAnalyticsService } from './application/voice-analytics.service';
import { VoiceNameEnricherService } from './application/voice-name-enricher.service';
import { DiagnosisController } from './presentation/diagnosis.controller';
import { BadgeScheduler } from './self-diagnosis/application/badge.scheduler';
import { BadgeService } from './self-diagnosis/application/badge.service';
import { BadgeQueryService } from './self-diagnosis/application/badge-query.service';
import { SelfDiagnosisService } from './self-diagnosis/application/self-diagnosis.service';
import { VoiceHealthBadgeOrmEntity } from './self-diagnosis/infrastructure/voice-health-badge.orm-entity';
import { VoiceHealthConfigOrmEntity } from './self-diagnosis/infrastructure/voice-health-config.orm-entity';
import { VoiceHealthConfigRepository } from './self-diagnosis/infrastructure/voice-health-config.repository';
import { SelfDiagnosisController } from './self-diagnosis/presentation/self-diagnosis.controller';
import { WeeklyReportScheduler } from './weekly-report/application/weekly-report.scheduler';
import { WeeklyReportService } from './weekly-report/application/weekly-report.service';
import { WeeklyReportConfigOrmEntity } from './weekly-report/infrastructure/weekly-report-config.orm-entity';
import { WeeklyReportConfigRepository } from './weekly-report/infrastructure/weekly-report-config.repository';
import { WeeklyReportController } from './weekly-report/presentation/weekly-report.controller';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      VoiceDailyOrm,
      VoiceCoPresencePairDailyOrm,
      MocoHuntingDaily,
      VoiceHealthConfigOrmEntity,
      VoiceHealthBadgeOrmEntity,
      WeeklyReportConfigOrmEntity,
    ]),
    GatewayModule,
    AuthModule,
    LlmModule,
  ],
  controllers: [SelfDiagnosisController, DiagnosisController, WeeklyReportController],
  providers: [
    VoiceAiAnalysisService,
    VoiceAnalyticsService,
    VoiceNameEnricherService,
    VoiceRedisRepository,
    VoiceHealthConfigRepository,
    SelfDiagnosisService,
    BadgeService,
    BadgeScheduler,
    BadgeQueryService,
    WeeklyReportConfigRepository,
    WeeklyReportService,
    WeeklyReportScheduler,
  ],
  exports: [
    VoiceAiAnalysisService,
    VoiceAnalyticsService,
    VoiceRedisRepository,
    BadgeQueryService,
    SelfDiagnosisService,
    VoiceHealthConfigRepository,
    WeeklyReportConfigRepository,
  ],
})
export class VoiceAnalyticsModule {}
