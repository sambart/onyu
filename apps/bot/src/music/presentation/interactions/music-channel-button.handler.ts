import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonInteraction,
  GuildMember,
  Interaction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { ChartCrawlerService } from '../../application/chart-crawler.service';
import { MusicService } from '../../application/music.service';

const MUSIC_CHANNEL_BUTTON_PREFIX = 'music_channel:';
const MUSIC_CHANNEL_MODAL_ID = 'music_channel:search_modal';
const MAX_QUEUE_DISPLAY = 10;

/**
 * 음악 채널 버튼 인터랙션 핸들러.
 * customId가 'music_channel:' 접두사인 버튼만 처리한다.
 */
@Injectable()
export class MusicChannelButtonHandler {
  private readonly logger = new Logger(MusicChannelButtonHandler.name);

  constructor(
    private readonly musicService: MusicService,
    private readonly chartCrawler: ChartCrawlerService,
  ) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith(MUSIC_CHANNEL_BUTTON_PREFIX)) return;
    if (!interaction.guildId) return;

    // guildId 가드 통과 후 지역 변수로 추출하여 하위 메서드에 전달
    const guildId = interaction.guildId;
    const type = interaction.customId.slice(MUSIC_CHANNEL_BUTTON_PREFIX.length);

    try {
      await this.dispatchButton(interaction, type, guildId);
    } catch (err) {
      this.logger.error(
        `[MUSIC_CHANNEL_BTN] Failed: type=${type}`,
        err instanceof Error ? err.stack : err,
      );
      try {
        const content = '오류가 발생했습니다. 잠시 후 다시 시도하세요.';
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ ephemeral: true, content });
        } else {
          await interaction.reply({ ephemeral: true, content });
        }
      } catch {
        // 응답 실패 무시
      }
    }
  }

  private async dispatchButton(
    interaction: ButtonInteraction,
    type: string,
    guildId: string,
  ): Promise<void> {
    switch (type) {
      case 'search':
        return this.handleSearch(interaction);
      case 'pause_resume':
        return this.handlePauseResume(interaction, guildId);
      case 'skip':
        return this.handleSkip(interaction, guildId);
      case 'stop':
        return this.handleStop(interaction, guildId);
      case 'queue':
        return this.handleQueue(interaction, guildId);
      case 'melon_chart':
        return this.handleMelonChart(interaction, guildId);
      case 'billboard_chart':
        return this.handleBillboardChart(interaction, guildId);
      default:
        break;
    }
  }

  /** 음성 채널 접속 여부 확인. 미접속 시 ephemeral 응답 후 null 반환. */
  private async checkVoiceChannel(interaction: ButtonInteraction): Promise<string | null> {
    const member = interaction.member;
    if (!(member instanceof GuildMember)) return null;

    const voiceChannelId = member.voice.channelId;
    if (!voiceChannelId) {
      const content = '음성 채널에 먼저 입장해 주세요.';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content });
      } else {
        await interaction.reply({ content, ephemeral: true });
      }
      return null;
    }
    return voiceChannelId;
  }

  /** search → Modal 팝업 표시. */
  private async handleSearch(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId(MUSIC_CHANNEL_MODAL_ID)
      .setTitle('음악 검색')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('query')
            .setLabel('검색어')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
  }

  /** pause_resume → 현재 상태에 따라 일시정지/재개 토글. */
  private async handlePauseResume(interaction: ButtonInteraction, guildId: string): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const voiceChannelId = await this.checkVoiceChannel(interaction);
    if (!voiceChannelId) return;

    try {
      const kazagumo = this.musicService.getKazagumo();
      const player = kazagumo.players.get(guildId);
      if (!player?.queue.current) {
        await interaction.editReply({ content: '현재 재생 중인 곡이 없습니다.' });
        return;
      }

      if (player.paused) {
        this.musicService.resume(guildId);
        await interaction.editReply({ content: '재생을 재개했습니다.' });
      } else {
        this.musicService.pause(guildId);
        await interaction.editReply({ content: '일시정지했습니다.' });
      }
    } catch {
      await interaction.editReply({ content: '현재 재생 중인 곡이 없습니다.' });
    }
  }

  /** skip → 현재 트랙 건너뛰기. */
  private async handleSkip(interaction: ButtonInteraction, guildId: string): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const voiceChannelId = await this.checkVoiceChannel(interaction);
    if (!voiceChannelId) return;

    try {
      const { nextTrack } = await this.musicService.skip(guildId);
      if (nextTrack) {
        await interaction.editReply({ content: `스킵했습니다. 다음 곡: **${nextTrack.title}**` });
      } else {
        await interaction.editReply({ content: '스킵했습니다. 다음 곡이 없어 퇴장합니다.' });
      }
    } catch {
      await interaction.editReply({ content: '현재 재생 중인 곡이 없습니다.' });
    }
  }

  /** stop → 재생 중지, 큐 초기화, 음성 채널 퇴장. */
  private async handleStop(interaction: ButtonInteraction, guildId: string): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const voiceChannelId = await this.checkVoiceChannel(interaction);
    if (!voiceChannelId) return;

    try {
      this.musicService.stop(guildId);
      await interaction.editReply({ content: '재생을 정지하고 퇴장했습니다.' });
    } catch {
      await interaction.editReply({ content: '현재 재생 중인 곡이 없습니다.' });
    }
  }

  /** queue → 현재 큐 목록을 ephemeral 메시지로 응답. */
  private async handleQueue(interaction: ButtonInteraction, guildId: string): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const kazagumo = this.musicService.getKazagumo();
    const player = kazagumo.players.get(guildId);

    if (!player?.queue.current) {
      await interaction.editReply({ content: '현재 재생 중인 곡이 없습니다.' });
      return;
    }

    const current = player.queue.current;
    const queue = [...player.queue];

    const lines: string[] = [`**현재 재생 중**: ${current.title} - ${current.author ?? 'Unknown'}`];

    if (queue.length > 0) {
      lines.push('\n**대기 중**:');
      queue.slice(0, MAX_QUEUE_DISPLAY).forEach((track, i) => {
        lines.push(`${i + 1}. ${track.title} - ${track.author ?? 'Unknown'}`);
      });
      if (queue.length > MAX_QUEUE_DISPLAY) {
        lines.push(`... 외 ${queue.length - MAX_QUEUE_DISPLAY}곡`);
      }
    }

    await interaction.editReply({ content: lines.join('\n') });
  }

  /** melon_chart → 멜론 차트 크롤링 후 일괄 재생. */
  private async handleMelonChart(interaction: ButtonInteraction, guildId: string): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const voiceChannelId = await this.checkVoiceChannel(interaction);
    if (!voiceChannelId) return;

    const entries = await this.chartCrawler.getMelonChart();
    if (entries.length === 0) {
      await interaction.editReply({ content: '멜론 차트를 불러오지 못했습니다.' });
      return;
    }

    const queries = entries.map((e) => `${e.title} ${e.artist}`);
    const addedCount = await this.musicService.playBulk({
      queries,
      guildId,
      textChannelId: interaction.channelId,
      voiceChannelId,
      requesterId: interaction.user.id,
    });

    await interaction.editReply({
      content: `멜론 차트 ${addedCount}곡을 대기열에 추가했습니다.`,
    });
  }

  /** billboard_chart → 빌보드 차트 크롤링 후 일괄 재생. */
  private async handleBillboardChart(
    interaction: ButtonInteraction,
    guildId: string,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const voiceChannelId = await this.checkVoiceChannel(interaction);
    if (!voiceChannelId) return;

    const entries = await this.chartCrawler.getBillboardChart();
    if (entries.length === 0) {
      await interaction.editReply({ content: '빌보드 차트를 불러오지 못했습니다.' });
      return;
    }

    const queries = entries.map((e) => `${e.title} ${e.artist}`);
    const addedCount = await this.musicService.playBulk({
      queries,
      guildId,
      textChannelId: interaction.channelId,
      voiceChannelId,
      requesterId: interaction.user.id,
    });

    await interaction.editReply({
      content: `빌보드 차트 ${addedCount}곡을 대기열에 추가했습니다.`,
    });
  }
}
