import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { BotAutoChannelInteractionHandler } from './auto-channel/bot-auto-channel-interaction.handler';
import { BotChannelStateHandler } from './channel/bot-channel-state.handler';
import { BotGuildCreateHandler } from './guild-member/bot-guild-create.handler';
import { BotGuildMemberSyncHandler } from './guild-member/bot-guild-member-sync.handler';
import { BotMemberRemoveHandler } from './guild-member/bot-member-remove.handler';
import { BotMemberUpdateHandler } from './guild-member/bot-member-update.handler';
import { BotUserUpdateHandler } from './guild-member/bot-user-update.handler';
import { BotNewbieInteractionHandler } from './newbie/bot-newbie-interaction.handler';
import { BotNewbieMemberAddHandler } from './newbie/bot-newbie-member-add.handler';
import { BotStatusPrefixInteractionHandler } from './status-prefix/bot-status-prefix-interaction.handler';
import { BotStickyMessageHandler } from './sticky-message/bot-sticky-message.handler';
import { BotVoiceStateDispatcher } from './voice/bot-voice-state.dispatcher';
import { BotVoiceSyncHandler } from './voice/bot-voice-sync.handler';

/**
 * Discord 이벤트를 수신하여 API로 전달하는 모듈.
 * API의 DiscordEventsModule을 대체한다.
 */
@Module({
  imports: [DiscordModule.forFeature()],
  providers: [
    BotVoiceStateDispatcher,
    BotVoiceSyncHandler,
    BotNewbieMemberAddHandler,
    BotNewbieInteractionHandler,
    BotStatusPrefixInteractionHandler,
    BotAutoChannelInteractionHandler,
    BotStickyMessageHandler,
    BotChannelStateHandler,
    BotGuildMemberSyncHandler,
    BotGuildCreateHandler,
    BotMemberUpdateHandler,
    BotMemberRemoveHandler,
    BotUserUpdateHandler,
  ],
})
export class BotEventModule {}
