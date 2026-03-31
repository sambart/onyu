import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';
import { ChartCrawlerService } from './application/chart-crawler.service';
import { MusicService } from './application/music.service';
import { MusicChannelService } from './application/music-channel.service';
import { KazagumoProvider } from './infrastructure/kazagumo.provider';
import { MusicPauseCommand } from './presentation/commands/music-pause.command';
import { MusicPlayCommand } from './presentation/commands/music-play.command';
import { MusicResumeCommand } from './presentation/commands/music-resume.command';
import { MusicSkipCommand } from './presentation/commands/music-skip.command';
import { MusicStopCommand } from './presentation/commands/music-stop.command';
import { MusicChannelButtonHandler } from './presentation/interactions/music-channel-button.handler';
import { MusicSearchModalHandler } from './presentation/interactions/music-search-modal.handler';
import { MusicChannelMessageListener } from './presentation/listeners/music-channel-message.listener';

const REDIS_CLIENT = 'REDIS_CLIENT';
const MUSIC_MODULE_REDIS_LOGGER = 'MusicModuleRedis';

@Module({
  imports: [DiscordModule.forFeature(), ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const client = new Redis({
          host: config.get('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          password: config.get('REDIS_PASSWORD') || undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
        });

        client.on('error', (err: unknown) => {
          const message = err instanceof Error ? err.stack : String(err);
          process.stderr.write(`[${MUSIC_MODULE_REDIS_LOGGER}] Redis error: ${message}\n`);
        });

        return client;
      },
    },
    BotI18nService,
    LocaleResolverService,
    KazagumoProvider,
    MusicService,
    MusicChannelService,
    ChartCrawlerService,
    MusicPlayCommand,
    MusicSkipCommand,
    MusicStopCommand,
    MusicPauseCommand,
    MusicResumeCommand,
    MusicChannelButtonHandler,
    MusicSearchModalHandler,
    MusicChannelMessageListener,
  ],
})
export class MusicModule {}
