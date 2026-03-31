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
  name: 'resume',
  description: 'Resume the paused song',
  nameLocalizations: { ko: '재개' },
  descriptionLocalizations: { ko: '일시정지된 음악을 다시 재생합니다.' },
})
export class MusicResumeCommand {
  private readonly logger = new Logger(MusicResumeCommand.name);

  constructor(
    private readonly musicService: MusicService,
    private readonly musicChannelService: MusicChannelService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onResume(@EventParams() args: ClientEvents['interactionCreate']): Promise<void> {
    const [interaction] = args;
    if (!interaction.isChatInputCommand()) return;

    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    try {
      const guildId = interaction.guildId ?? '';
      const player = this.musicService.resume(guildId);
      const track = player.queue.current;
      if (track) {
        const embed = buildNowPlayingEmbed({ track, player, status: 'playing' });
        await interaction.reply({ embeds: [embed] });
        await this.musicChannelService.updatePauseState(guildId, false, track);
      } else {
        await interaction.reply(this.i18n.t(locale, 'music.resumed'));
      }
    } catch (error) {
      this.logger.error('Error resume music:', error);
      await interaction.reply({
        content: this.i18n.t(locale, 'music.resumeError'),
        ephemeral: true,
      });
    }
  }
}
