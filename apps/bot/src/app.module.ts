import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { BotApiClientModule } from '@onyu/bot-api-client';

import { BotCommandModule } from './command/bot-command.module';
import { DiscordConfig } from './config/discord.config';
import { BotEventModule } from './event/bot-event.module';
import { BotMetricsModule } from './monitoring/bot-metrics.module';
import { MusicModule } from './music/music.module';
import { BotSchedulerModule } from './scheduler/bot-scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DiscordModule.forRootAsync(DiscordConfig),
    BotApiClientModule.forRoot({
      baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
      apiKey: process.env.BOT_API_KEY ?? '',
    }),
    BotEventModule,
    BotCommandModule,
    MusicModule,
    BotSchedulerModule,
    BotMetricsModule,
  ],
})
export class AppModule {}
