import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ChannelOrm } from './infrastructure/channel.orm-entity';

@Injectable()
export class ChannelService {
  private readonly logger = new Logger(ChannelService.name);
  constructor(
    @InjectRepository(ChannelOrm)
    private readonly channelRepository: Repository<ChannelOrm>,
  ) {}

  async findOrCreateChannel(
    channelId: string,
    channelName: string,
    guildId?: string,
    categoryId?: string | null,
    categoryName?: string | null,
  ): Promise<ChannelOrm> {
    let channel = await this.channelRepository.findOne({
      where: { discordChannelId: channelId },
    });

    if (!channel) {
      channel = this.channelRepository.create({
        discordChannelId: channelId,
        channelName,
        guildId: guildId ?? null,
        categoryId: categoryId ?? null,
        categoryName: categoryName ?? null,
      });
      channel = await this.channelRepository.save(channel);
    } else {
      const needsGuildUpdate = guildId && !channel.guildId;
      const categoryChanged =
        categoryId !== undefined &&
        (channel.categoryId !== categoryId || channel.categoryName !== categoryName);

      if (needsGuildUpdate || categoryChanged) {
        if (needsGuildUpdate) channel.guildId = guildId;
        if (categoryChanged) {
          channel.categoryId = categoryId ?? null;
          channel.categoryName = categoryName ?? null;
        }
        channel = await this.channelRepository.save(channel);
      }
    }

    return channel;
  }

  async getAllChannels(): Promise<ChannelOrm[]> {
    return this.channelRepository.find();
  }
}
