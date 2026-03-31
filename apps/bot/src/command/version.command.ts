import { Command, EventParams, Handler } from '@discord-nestjs/core';
import { Injectable } from '@nestjs/common';
import { ClientEvents, EmbedBuilder } from 'discord.js';

import * as packageJson from '../../package.json';

@Injectable()
@Command({
  name: 'version',
  description: '봇의 버전 정보를 표시합니다.',
})
export class VersionCommand {
  @Handler()
  async onVersion(
    @EventParams() args: ClientEvents['interactionCreate'],
  ): Promise<void> {
    const [interaction] = args;
    if (!interaction.isChatInputCommand()) return;

    const embed = new EmbedBuilder()
      .setTitle('Onyu')
      .setDescription(`v${packageJson.version}`)
      .setColor(0x4f46e5)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
