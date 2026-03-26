import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { VoiceDailyOrm } from '../channel/voice/infrastructure/voice-daily.orm-entity';
import { InactiveMemberRecordOrm } from '../inactive-member/infrastructure/inactive-member-record.orm-entity';
import { NewbieModule } from '../newbie/newbie.module';
import { OverviewService } from './application/overview.service';
import { OverviewController } from './presentation/overview.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([VoiceDailyOrm, InactiveMemberRecordOrm]),
    NewbieModule,
    AuthModule,
  ],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
