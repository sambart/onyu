import { InjectDiscordClient } from '@discord-nestjs/core';
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'discord.js';
import type { KazagumoPlayer, KazagumoTrack } from 'kazagumo';
import { Kazagumo } from 'kazagumo';
import { Connectors } from 'shoukaku';

import { MusicChannelService } from '../application/music-channel.service';

@Injectable()
export class KazagumoProvider implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(KazagumoProvider.name);
  private kazagumo!: Kazagumo;

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly configService: ConfigService,
    private readonly musicChannelService: MusicChannelService,
  ) {}

  async onModuleInit(): Promise<void> {
    const lavalinkUrl = this.configService.getOrThrow<string>('LAVALINK_URL');
    const lavalinkPassword = this.configService.getOrThrow<string>('LAVALINK_PASSWORD');

    this.kazagumo = new Kazagumo(
      {
        defaultSearchEngine: 'spotify',
        defaultSource: 'spsearch:',
        plugins: [],
        send: (guildId, payload) => {
          const guild = this.client.guilds.cache.get(guildId);
          if (guild) guild.shard.send(payload);
        },
      },
      new Connectors.DiscordJS(this.client),
      [
        {
          name: 'Lavalink',
          url: lavalinkUrl,
          auth: lavalinkPassword,
          secure: false,
        },
      ],
    );

    this.registerEvents();
  }

  getInstance(): Kazagumo {
    return this.kazagumo;
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.kazagumo) return;
    // 모든 플레이어 정리
    for (const [guildId] of this.kazagumo.players) {
      this.kazagumo.destroyPlayer(guildId);
    }
    this.logger.log('All Kazagumo players destroyed');
  }

  private registerEvents(): void {
    this.kazagumo.shoukaku.on('ready', (name) => {
      this.logger.log(`Lavalink node "${name}" connected`);
    });

    this.kazagumo.shoukaku.on('error', (name, error) => {
      this.logger.error(`Lavalink node "${name}" error: ${error.message}`);
    });

    this.kazagumo.shoukaku.on('close', (name, code, reason) => {
      this.logger.warn(`Lavalink node "${name}" closed: ${code} ${reason}`);
    });

    this.kazagumo.on('playerStart', (player: KazagumoPlayer, track: KazagumoTrack) => {
      this.logger.log(`Now playing: ${track.title} [guild=${player.guildId}]`);
      this.musicChannelService.updatePlayingEmbed(player.guildId, track).catch((err: unknown) => {
        this.logger.warn(
          `Music channel embed update failed: guild=${player.guildId}`,
          err instanceof Error ? err.stack : err,
        );
      });
    });

    this.kazagumo.on('playerEmpty', (player: KazagumoPlayer) => {
      this.logger.debug(`Queue ended [guild=${player.guildId}]`);
      this.musicChannelService.restoreIdleEmbed(player.guildId).catch((err: unknown) => {
        this.logger.warn(
          `Music channel idle embed restore failed: guild=${player.guildId}`,
          err instanceof Error ? err.stack : err,
        );
      });
    });
  }
}
