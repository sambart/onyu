import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BotApiModule } from './bot-api/bot-api.module';
import { AutoChannelModule } from './channel/auto/auto-channel.module';
import { ChannelModule } from './channel/channel.module';
import { VoiceChannelModule } from './channel/voice/voice-channel.module';
import { CommonModule } from './common/common.module';
import { GuildMembershipGuard } from './common/guards/guild-membership.guard';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';
import { BaseConfig } from './config/base.config';
import { TypeORMConfig } from './config/typeorm.config';
import { DiscordRestModule } from './discord-rest/discord-rest.module';
import { HealthModule } from './health/health.module';
import { InactiveMemberModule } from './inactive-member/inactive-member.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { MusicModule } from './music/music.module';
import { NewbieModule } from './newbie/newbie.module';
import { OverviewModule } from './overview/overview.module';
import { RedisModule } from './redis/redis.module';
import { StatusPrefixModule } from './status-prefix/status-prefix.module';
import { StickyMessageModule } from './sticky-message/sticky-message.module';
import { VoiceAnalyticsModule } from './voice-analytics/voice-analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot(BaseConfig),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',
            ...(isProduction
              ? {}
              : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
          },
        };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DiscordRestModule,
    TypeOrmModule.forRootAsync(TypeORMConfig),
    ChannelModule,
    VoiceChannelModule,
    AutoChannelModule,
    NewbieModule,
    InactiveMemberModule,
    StatusPrefixModule,
    StickyMessageModule,
    MusicModule,
    MonitoringModule,
    RedisModule,
    HealthModule,
    CommonModule,
    VoiceAnalyticsModule,
    AuthModule,
    OverviewModule,
    BotApiModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: GuildMembershipGuard },
  ],
})
export class AppModule {}
