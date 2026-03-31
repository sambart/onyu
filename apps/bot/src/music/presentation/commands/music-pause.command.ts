import { Command, EventParams, Handler } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { ClientEvents } from 'discord.js';

import { BotI18nService } from '../../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../../common/application/locale-resolver.service';
import { MusicService } from '../../application/music.service';
import { MusicChannelService } from '../../application/music-channel.service';
import { buildNowPlayingEmbed } from '../utils/now-playing-embed.builder';

@Injectable()
@Command({
  name: 'pause',
  description: 'Pause the current song',
  nameLocalizations: { ko: '일시정지' },
  descriptionLocalizations: { ko: '현재 재생 중인 음악을 일시정지합니다.' },
})
export class MusicPauseCommand {
  private readonly logger = new Logger(MusicPauseCommand.name);

  constructor(
    private readonly musicService: MusicService,
    private readonly musicChannelService: MusicChannelService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onPause(@EventParams() args: ClientEvents['interactionCreate']): Promise<void> {
    const [interaction] = args;
    if (!interaction.isChatInputCommand()) return;

    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    try {
      const guildId = interaction.guildId ?? '';
      const player = this.musicService.pause(guildId);
      const track = player.queue.current;
      if (track) {
        const embed = buildNowPlayingEmbed({ track, player, status: 'paused' });
        await interaction.reply({ embeds: [embed] });
        await this.musicChannelService.updatePauseState(guildId, true, track);
      } else {
        await interaction.reply(this.i18n.t(locale, 'music.paused'));
      }
    } catch (error) {
      this.logger.error('Error pause music:', error);
      await interaction.reply({
        content: this.i18n.t(locale, 'music.pauseError'),
        ephemeral: true,
      });
    }
  }
}
