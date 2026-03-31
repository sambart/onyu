import { Command, EventParams, Handler } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { ClientEvents } from 'discord.js';

import { BotI18nService } from '../../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../../common/application/locale-resolver.service';
import { MusicService } from '../../application/music.service';
import { MusicChannelService } from '../../application/music-channel.service';

@Injectable()
@Command({
  name: 'stop',
  description: 'Stop the music',
  nameLocalizations: { ko: '중지' },
  descriptionLocalizations: { ko: '음악을 중지합니다.' },
})
export class MusicStopCommand {
  private readonly logger = new Logger(MusicStopCommand.name);

  constructor(
    private readonly musicService: MusicService,
    private readonly musicChannelService: MusicChannelService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onStop(@EventParams() args: ClientEvents['interactionCreate']): Promise<void> {
    const [interaction] = args;
    if (!interaction.isChatInputCommand()) return;

    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    await interaction.deferReply();

    try {
      const guildId = interaction.guildId ?? '';
      this.musicService.stop(guildId);
      await interaction.followUp(this.i18n.t(locale, 'music.stopped'));
      await this.musicChannelService.restoreIdleEmbed(guildId);
    } catch (error) {
      this.logger.error('Error stop music:', error);
      await interaction.followUp({
        content: this.i18n.t(locale, 'music.stopError'),
        ephemeral: true,
      });
    }
  }
}
