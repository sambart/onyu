import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { VoiceDailyOrm } from '../channel/voice/infrastructure/voice-daily.orm-entity';
import { VoiceChannelModule } from '../channel/voice/voice-channel.module';
import { InactiveMemberScheduler } from './application/inactive-member.scheduler';
import { InactiveMemberService } from './application/inactive-member.service';
import { InactiveMemberActionService } from './application/inactive-member-action.service';
import { InactiveMemberRepository } from './infrastructure/inactive-member.repository';
import { InactiveMemberActionLogOrm } from './infrastructure/inactive-member-action-log.orm-entity';
import { InactiveMemberConfigOrm } from './infrastructure/inactive-member-config.orm-entity';
import { InactiveMemberDiscordAdapter } from './infrastructure/inactive-member-discord.adapter';
import { InactiveMemberQueryRepository } from './infrastructure/inactive-member-query.repository';
import { InactiveMemberRecordOrm } from './infrastructure/inactive-member-record.orm-entity';
import { InactiveMemberTrendDailyOrm } from './infrastructure/inactive-member-trend-daily.orm-entity';
import { InactiveMemberController } from './presentation/inactive-member.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InactiveMemberConfigOrm,
      InactiveMemberRecordOrm,
      InactiveMemberActionLogOrm,
      InactiveMemberTrendDailyOrm,
      VoiceDailyOrm,
    ]),
    AuthModule,
    VoiceChannelModule,
  ],
  controllers: [InactiveMemberController],
  providers: [
    InactiveMemberDiscordAdapter,
    InactiveMemberRepository,
    InactiveMemberQueryRepository,
    InactiveMemberService,
    InactiveMemberActionService,
    InactiveMemberScheduler,
  ],
})
export class InactiveMemberModule {}
