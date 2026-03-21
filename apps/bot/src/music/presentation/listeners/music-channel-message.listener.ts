import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import type { Message } from 'discord.js';

import { MusicService } from '../../application/music.service';

/**
 * 음악 전용 채널 텍스트 메시지 수신 리스너.
 * 사용자가 입력한 텍스트를 검색어로 재생한다.
 */
@Injectable()
export class MusicChannelMessageListener {
  private readonly logger = new Logger(MusicChannelMessageListener.name);

  constructor(
    private readonly musicService: MusicService,
    private readonly botApiClient: BotApiClientService,
  ) {}

  @On('messageCreate')
  async handleMessage(message: Message): Promise<void> {
    // 봇 메시지 무시
    if (message.author.bot) return;
    if (!message.guildId) return;

    try {
      // 채널 ID로 음악 채널 설정 조회
      const config = await this.botApiClient.getMusicChannelConfigByChannel(message.channelId);
      if (!config?.enabled) return;

      // 음성 채널 접속 확인
      const member = message.member;
      if (!member?.voice.channelId) {
        await message.reply({ content: '음성 채널에 먼저 입장해 주세요.' });
        return;
      }

      // 검색어로 재생
      await this.musicService.play({
        query: message.content,
        guildId: message.guildId,
        textChannelId: message.channelId,
        voiceChannelId: member.voice.channelId,
        requesterId: message.author.id,
      });
    } catch (err) {
      this.logger.error(
        `[MUSIC_CHANNEL_MSG] Failed: guild=${message.guildId} channel=${message.channelId}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
