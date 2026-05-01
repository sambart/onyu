import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../auth/auth.module';
import { DiscordVoiceGateway } from '../voice/infrastructure/discord-voice.gateway';
import { VoiceChannelModule } from '../voice/voice-channel.module';
import { AutoChannelService } from './application/auto-channel.service';
import { AutoChannelBootstrapService } from './application/auto-channel-bootstrap.service';
import { AutoChannelSweepScheduler } from './application/auto-channel-sweep.scheduler';
import { AutoChannelController } from './auto-channel.controller';
import { AutoChannelButtonOrm } from './infrastructure/auto-channel-button.orm-entity';
import { AutoChannelConfigOrm } from './infrastructure/auto-channel-config.orm-entity';
import { AutoChannelConfigRepository } from './infrastructure/auto-channel-config.repository';
import { AutoChannelDiscordGateway } from './infrastructure/auto-channel-discord.gateway';
import { AutoChannelRedisRepository } from './infrastructure/auto-channel-redis.repository';
import { AutoChannelSubOptionOrm } from './infrastructure/auto-channel-sub-option.orm-entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AutoChannelConfigOrm, AutoChannelButtonOrm, AutoChannelSubOptionOrm]),
    AuthModule,
    VoiceChannelModule,
  ],
  controllers: [AutoChannelController],
  providers: [
    AutoChannelConfigRepository,
    AutoChannelRedisRepository,
    AutoChannelDiscordGateway,
    AutoChannelBootstrapService,
    AutoChannelService,
    AutoChannelSweepScheduler,
    DiscordVoiceGateway,
  ],
  exports: [
    AutoChannelConfigRepository,
    AutoChannelRedisRepository,
    AutoChannelDiscordGateway,
    AutoChannelService,
  ],
})
export class AutoChannelModule {}
