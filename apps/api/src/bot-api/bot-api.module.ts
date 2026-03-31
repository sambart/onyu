import { Module } from '@nestjs/common';

import { AutoChannelModule } from '../channel/auto/auto-channel.module';
import { CoPresenceModule } from '../channel/voice/co-presence/co-presence.module';
import { VoiceChannelModule } from '../channel/voice/voice-channel.module';
import { MusicModule } from '../music/music.module';
import { NewbieModule } from '../newbie/newbie.module';
import { StatusPrefixModule } from '../status-prefix/status-prefix.module';
import { StickyMessageModule } from '../sticky-message/sticky-message.module';
import { VoiceAnalyticsModule } from '../voice-analytics/voice-analytics.module';
import { BotAutoChannelController } from './auto-channel/bot-auto-channel.controller';
import { BotApiAuthGuard } from './bot-api-auth.guard';
import { BotCoPresenceController } from './co-presence/bot-co-presence.controller';
import { BotMeController } from './me/bot-me.controller';
import { BotMusicController } from './music/bot-music.controller';
import { BotNewbieController } from './newbie/bot-newbie.controller';
import { BotStatusPrefixController } from './status-prefix/bot-status-prefix.controller';
import { BotStickyMessageController } from './sticky-message/bot-sticky-message.controller';
import { BotVoiceController } from './voice/bot-voice.controller';
import { BotVoiceEventListener } from './voice/bot-voice-event.listener';
import { BotVoiceAnalyticsController } from './voice-analytics/bot-voice-analytics.controller';

/**
 * Bot → API 통신을 위한 내부 API 모듈.
 * Bot 프로세스에서 HTTP로 호출하는 엔드포인트를 제공한다.
 */
@Module({
  imports: [
    VoiceChannelModule,
    AutoChannelModule,
    CoPresenceModule,
    MusicModule,
    StatusPrefixModule,
    NewbieModule,
    StickyMessageModule,
    VoiceAnalyticsModule,
  ],
  controllers: [
    BotVoiceController,
    BotVoiceAnalyticsController,
    BotCoPresenceController,
    BotMeController,
    BotNewbieController,
    BotStatusPrefixController,
    BotStickyMessageController,
    BotAutoChannelController,
    BotMusicController,
  ],
  providers: [BotApiAuthGuard, BotVoiceEventListener],
  exports: [BotApiAuthGuard],
})
export class BotApiModule {}
