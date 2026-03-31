import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { MusicChannelConfigService } from './application/music-channel-config.service';
import { MusicChannelConfigOrm } from './infrastructure/music-channel-config.orm-entity';
import { MusicChannelConfigRepository } from './infrastructure/music-channel-config.repository';
import { MusicChannelDiscordAdapter } from './infrastructure/music-channel-discord.adapter';
import { MusicChannelConfigController } from './presentation/music-channel-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MusicChannelConfigOrm]), AuthModule],
  controllers: [MusicChannelConfigController],
  providers: [MusicChannelDiscordAdapter, MusicChannelConfigRepository, MusicChannelConfigService],
  exports: [MusicChannelConfigService, MusicChannelConfigRepository],
})
export class MusicModule {}
