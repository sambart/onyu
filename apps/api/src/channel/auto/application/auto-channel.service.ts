import { Injectable, Logger } from '@nestjs/common';
import type {
  AutoChannelButtonClickDto,
  AutoChannelButtonResult,
  AutoChannelSubOptionDto,
} from '@onyu/bot-api-client';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  GuildMember,
} from 'discord.js';

import { getErrorStack } from '../../../common/util/error.util';
import { VoiceChannelService } from '../../voice/application/voice-channel.service';
import { DiscordVoiceGateway } from '../../voice/infrastructure/discord-voice.gateway';
import { VoiceRedisRepository } from '../../voice/infrastructure/voice-redis.repository';
import { VoiceStateDto } from '../../voice/infrastructure/voice-state.dto';
import { AutoChannelButtonOrm } from '../infrastructure/auto-channel-button.orm-entity';
import { AutoChannelConfigRepository } from '../infrastructure/auto-channel-config.repository';
import { AutoChannelDiscordGateway } from '../infrastructure/auto-channel-discord.gateway';
import { AutoChannelRedisRepository } from '../infrastructure/auto-channel-redis.repository';
import { AutoChannelConfirmedState } from '../infrastructure/auto-channel-state';
import { AutoChannelSubOptionOrm } from '../infrastructure/auto-channel-sub-option.orm-entity';

/** Discord 버튼 제약: ActionRow당 최대 버튼 수 */
const BUTTONS_PER_ROW = 5;

/** 하위 선택지 버튼 customId 접두사 */
const CUSTOM_ID_SUB_OPTION_PREFIX = 'auto_sub:';

@Injectable()
export class AutoChannelService {
  private readonly logger = new Logger(AutoChannelService.name);

  constructor(
    private readonly configRepo: AutoChannelConfigRepository,
    private readonly autoChannelRedis: AutoChannelRedisRepository,
    private readonly discordVoiceGateway: DiscordVoiceGateway,
    private readonly autoChannelDiscordGateway: AutoChannelDiscordGateway,
    private readonly voiceChannelService: VoiceChannelService,
    private readonly voiceRedisRepository: VoiceRedisRepository,
  ) {}

  /**
   * F-VOICE-012: 자동방 채널 삭제
   *
   * 채널이 비었을 때 호출된다. 확정방이면 Redis 키 삭제 후 Discord 채널 삭제.
   * 자동방이 아니면 무시한다.
   */
  async handleChannelEmpty(guildId: string, channelId: string): Promise<void> {
    const confirmedState = await this.autoChannelRedis.getConfirmedState(channelId);

    if (confirmedState) {
      await this.deleteConfirmedChannel(channelId, confirmedState);
      return;
    }

    // 자동방이 아니면 무시 (일반 채널)
    void guildId;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 단위 B: 버튼 인터랙션 + 확정방 생성 (F-VOICE-009, F-VOICE-010, F-VOICE-011)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * F-VOICE-009: 안내 메시지 전송 또는 갱신.
   * 웹 설정 저장 후 또는 봇 기동 시 호출.
   */
  async sendOrUpdateGuideMessage(configId: number): Promise<void> {
    const config = await this.configRepo.findById(configId);
    if (!config) {
      this.logger.warn(`AutoChannelConfig not found: configId=${configId}`);
      return;
    }

    // instant 모드는 안내 메시지 불필요
    if (config.mode === 'instant') {
      this.logger.log(`Skipping guide message for instant mode: configId=${configId}`);
      return;
    }

    const guideChannelId = config.guideChannelId;
    if (!guideChannelId) {
      this.logger.warn(`AutoChannelConfig has no guideChannelId: configId=${configId}`);
      return;
    }

    const buttonPayloads = config.buttons.map((btn) => ({
      id: btn.id,
      label: btn.label,
      emoji: btn.emoji,
    }));

    let messageId: string;

    if (config.guideMessageId) {
      const editResult = await this.autoChannelDiscordGateway.editGuideMessage(
        guideChannelId,
        config.guideMessageId,
        config.guideMessage,
        config.embedTitle ?? null,
        config.embedColor ?? null,
        buttonPayloads,
      );

      if (editResult === null) {
        messageId = await this.autoChannelDiscordGateway.sendGuideMessage(
          guideChannelId,
          config.guideMessage,
          config.embedTitle ?? null,
          config.embedColor ?? null,
          buttonPayloads,
        );
      } else {
        messageId = editResult;
      }
    } else {
      messageId = await this.autoChannelDiscordGateway.sendGuideMessage(
        guideChannelId,
        config.guideMessage,
        config.embedTitle ?? null,
        config.embedColor ?? null,
        buttonPayloads,
      );
    }

    await this.configRepo.updateGuideMessageId(configId, messageId);
    this.logger.log(`Guide message updated: configId=${configId}, messageId=${messageId}`);
  }

  /**
   * F-VOICE-010 / F-VOICE-011: 1단계 버튼 클릭 처리.
   * - 하위 선택지 없음 → convertToConfirmed 직접 호출 (F-VOICE-011)
   * - 하위 선택지 있음 → Ephemeral 메시지로 하위 버튼 표시 (F-VOICE-010)
   */
  async handleButtonClick(interaction: ButtonInteraction): Promise<void> {
    const buttonId = parseInt(interaction.customId.split(':')[1], 10);
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        ephemeral: true,
        content: '이 기능은 서버에서만 사용할 수 있습니다.',
      });
      return;
    }

    const member = interaction.member as GuildMember;
    const voiceChannelId = member.voice.channelId;

    if (!voiceChannelId) {
      await interaction.reply({
        ephemeral: true,
        content: '음성 채널에 입장한 후 클릭하세요.',
      });
      return;
    }

    // DB 조회 전에 deferReply로 인터랙션 3초 타임아웃 방지
    await interaction.deferReply({ ephemeral: true });

    const button = await this.configRepo.findButtonById(buttonId);

    if (!button?.config) {
      await interaction.editReply({
        content: '설정을 찾을 수 없습니다. 관리자에게 문의하세요.',
      });
      return;
    }

    // 대기채널 또는 해당 설정의 확정방에 있는지 검증
    const isAllowedForButton = await this.isAllowedChannel(
      voiceChannelId,
      button.config.id,
      button.config.triggerChannelId,
    );
    if (!isAllowedForButton) {
      await interaction.editReply({
        content: '대기 채널 또는 자동방에서만 선택할 수 있습니다.',
      });
      return;
    }

    if (button.subOptions.length === 0) {
      // 하위 선택지 없음 → 즉시 확정방 생성
      try {
        await this.convertToConfirmed({ interaction, guildId, userId, member, button });
      } catch (error) {
        this.logger.error(
          `[AUTO CHANNEL] convertToConfirmed failed: guild=${guildId} user=${userId}`,
          getErrorStack(error),
        );
        await interaction
          .editReply({ content: '채널 생성 중 오류가 발생했습니다. 다시 시도해주세요.' })
          .catch(() => {});
      }
    } else {
      // 하위 선택지 있음 → Ephemeral로 하위 버튼 표시
      const sorted = [...button.subOptions].sort((a, b) => a.sortOrder - b.sortOrder);
      const rows = this.buildSubOptionActionRows(sorted);

      await interaction.editReply({
        content: '선택지를 고르세요.',
        components: rows,
      });
    }
  }

  /**
   * F-VOICE-011: 2단계 하위 선택지 클릭 처리 → 확정방 생성.
   */
  async handleSubOptionClick(interaction: ButtonInteraction): Promise<void> {
    const subOptionId = parseInt(interaction.customId.split(':')[1], 10);
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        ephemeral: true,
        content: '이 기능은 서버에서만 사용할 수 있습니다.',
      });
      return;
    }

    const member = interaction.member as GuildMember;
    const voiceChannelId = member.voice.channelId;

    if (!voiceChannelId) {
      await interaction.reply({
        ephemeral: true,
        content: '음성 채널에 입장한 후 클릭하세요.',
      });
      return;
    }

    // DB 조회 전에 deferReply로 인터랙션 3초 타임아웃 방지
    await interaction.deferReply({ ephemeral: true });

    const subOption = await this.configRepo.findSubOptionById(subOptionId);

    if (!subOption?.button?.config) {
      await interaction.editReply({
        content: '설정을 찾을 수 없습니다. 관리자에게 문의하세요.',
      });
      return;
    }

    // 대기채널 또는 해당 설정의 확정방에 있는지 검증
    const isAllowedForSubOption = await this.isAllowedChannel(
      voiceChannelId,
      subOption.button.config.id,
      subOption.button.config.triggerChannelId,
    );
    if (!isAllowedForSubOption) {
      await interaction.editReply({
        content: '대기 채널 또는 자동방에서만 선택할 수 있습니다.',
      });
      return;
    }

    try {
      await this.convertToConfirmed({
        interaction,
        guildId,
        userId,
        member,
        button: subOption.button,
        subOption,
      });
    } catch (error) {
      this.logger.error(
        `[AUTO CHANNEL] convertToConfirmed (sub) failed: guild=${guildId} user=${userId}`,
        getErrorStack(error),
      );
      await interaction
        .editReply({ content: '채널 생성 중 오류가 발생했습니다. 다시 시도해주세요.' })
        .catch(() => {});
    }
  }

  /**
   * F-VOICE-011: 확정방 새로 생성 + 유저 이동 핵심 로직.
   */
  private async convertToConfirmed({
    interaction,
    guildId,
    userId,
    member,
    button,
    subOption,
  }: {
    interaction: ButtonInteraction;
    guildId: string;
    userId: string;
    member: GuildMember;
    button: AutoChannelButtonOrm;
    subOption?: AutoChannelSubOptionOrm;
  }): Promise<void> {
    const userName = member.displayName;

    // 1. 확정방 채널명 결정
    const baseName = this.buildChannelName(userName, button, subOption);

    const finalName = await this.resolveChannelName(guildId, button.targetCategoryId, baseName);

    // 2. 확정방 새로 생성
    const confirmedChannelId = await this.discordVoiceGateway.createVoiceChannel({
      guildId,
      name: finalName,
      parentCategoryId: button.targetCategoryId,
    });

    // 3. 유저를 확정방으로 이동
    await this.discordVoiceGateway.moveUserToChannel(guildId, userId, confirmedChannelId);

    // 4. Redis 확정 상태 저장
    await this.autoChannelRedis.setConfirmedState(confirmedChannelId, {
      guildId,
      userId,
      configId: button.configId,
      buttonId: button.id,
      subOptionId: subOption?.id,
    });

    // 4-1. Voice Redis에 auto-channel 메타데이터 캐싱 (F-VOICE-032)
    await this.cacheAutoChannelInfo({
      guildId,
      channelId: confirmedChannelId,
      configId: button.configId,
      configName: button.config.name,
      channelType: 'auto_select',
    });

    // 5. 세션 추적 시작 (F-VOICE-001과 동일)
    const voiceStateDto = this.buildVoiceStateDtoFromMember({
      member,
      guildId,
      userId,
      confirmedChannelId,
      channelName: finalName,
      categoryId: button.targetCategoryId,
    });
    await this.voiceChannelService.onUserJoined(voiceStateDto);

    // 6. 인터랙션 응답
    await interaction.editReply({ content: `**${finalName}** 방이 생성되었습니다!` });

    this.logger.log(
      `[AUTO CHANNEL] Confirmed: guild=${guildId} user=${userId} channel="${finalName}"`,
    );
  }

  /**
   * GuildMember의 현재 음성 상태로부터 VoiceStateDto를 구성한다.
   * 확정방 생성 직후 세션 추적 시작(F-VOICE-001)에 사용된다.
   */
  private buildVoiceStateDtoFromMember({
    member,
    guildId,
    userId,
    confirmedChannelId,
    channelName,
    categoryId,
  }: {
    member: GuildMember;
    guildId: string;
    userId: string;
    confirmedChannelId: string;
    channelName: string;
    categoryId: string;
  }): VoiceStateDto {
    const voiceState = member.voice;
    const micOn = voiceState.selfMute === null ? true : !voiceState.selfMute;
    const channel = voiceState.channel;
    const memberCount = channel ? channel.members.size : 1;

    return new VoiceStateDto(
      guildId,
      userId,
      confirmedChannelId,
      member.displayName,
      channelName,
      categoryId,
      channel?.parent?.name ?? null,
      micOn,
      memberCount === 1,
      memberCount,
      member.displayAvatarURL({ size: 128 }),
      voiceState.streaming ?? false,
      voiceState.selfVideo,
      voiceState.selfDeaf,
    );
  }

  /**
   * 채널명 템플릿 적용.
   *
   * subOption이 있으면 subOption 템플릿을 단독 사용한다.
   *   - {name}: 버튼 기본 이름으로 치환 (opt-in)
   *   - {username}: 유저 닉네임으로 치환
   * subOption이 없으면 버튼 템플릿을 사용한다.
   */
  private buildChannelName(
    userName: string,
    button: AutoChannelButtonOrm,
    subOption?: AutoChannelSubOptionOrm,
  ): string {
    const buttonTemplate = button.channelNameTemplate || `{username}의 ${button.label}`;
    const baseName = buttonTemplate.replace(/{username}/g, userName);

    if (subOption?.channelNameTemplate) {
      return subOption.channelNameTemplate
        .replace(/{name}/g, baseName)
        .replace(/{username}/g, userName);
    }

    return baseName;
  }

  /**
   * 확정방 채널명 중복 해소 (카테고리별 독립 넘버링).
   *
   * 템플릿에 {n}이 포함된 경우:
   *   {n}을 1부터 증가시키며 사용 가능한 이름 반환.
   *   예: "오버워치 #{n}" → "오버워치 #1", "오버워치 #2", ...
   *
   * {n}이 없는 경우 (기존 방식):
   *   중복 시 " 2", " 3", ... 순번 부여.
   *   예: "Onyu의 오버워치" → "Onyu의 오버워치 2"
   */
  private async resolveChannelName(
    guildId: string,
    categoryId: string,
    baseName: string,
  ): Promise<string> {
    const existingNames = await this.autoChannelDiscordGateway.fetchVoiceChannelNamesByCategory(
      guildId,
      categoryId,
    );
    const nameSet = new Set(existingNames);

    if (baseName.includes('{n}')) {
      let index = 1;
      while (nameSet.has(baseName.replace(/{n}/g, String(index)))) {
        index++;
      }
      return baseName.replace(/{n}/g, String(index));
    }

    if (!nameSet.has(baseName)) {
      return baseName;
    }

    let index = 2;
    while (nameSet.has(`${baseName} ${index}`)) {
      index++;
    }

    return `${baseName} ${index}`;
  }

  /**
   * 하위 선택지 목록을 Discord ActionRow 컴포넌트 배열로 변환.
   * customId 형식: auto_sub:{subOptionId}
   */
  private buildSubOptionActionRows(
    subOptions: AutoChannelSubOptionOrm[],
  ): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    for (let i = 0; i < subOptions.length; i += BUTTONS_PER_ROW) {
      const rowOptions = subOptions.slice(i, i + BUTTONS_PER_ROW);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        rowOptions.map((opt) => {
          const builder = new ButtonBuilder()
            .setCustomId(`${CUSTOM_ID_SUB_OPTION_PREFIX}${opt.id}`)
            .setLabel(opt.label)
            .setStyle(ButtonStyle.Primary);

          if (opt.emoji?.trim()) {
            try {
              builder.setEmoji(opt.emoji.trim());
            } catch {
              // 유효하지 않은 이모지 무시
            }
          }

          return builder;
        }),
      );
      rows.push(row);
    }

    return rows;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Bot → API: interaction 의존 없이 DTO 기반으로 처리
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Bot에서 호출: 1단계 버튼 클릭 처리.
   * - 하위 선택지 없음 → 확정방 생성 후 결과 반환
   * - 하위 선택지 있음 → subOptions 목록 반환 (Bot이 ActionRow 구성)
   */
  async handleButtonClickFromBot(dto: AutoChannelButtonClickDto): Promise<AutoChannelButtonResult> {
    if (!dto.voiceChannelId) {
      return { action: 'error', message: '음성 채널에 입장한 후 클릭하세요.' };
    }

    const button = await this.configRepo.findButtonById(dto.buttonId);

    if (!button?.config) {
      return { action: 'error', message: '설정을 찾을 수 없습니다. 관리자에게 문의하세요.' };
    }

    const isAllowedForBotButton = await this.isAllowedChannel(
      dto.voiceChannelId,
      button.config.id,
      button.config.triggerChannelId,
    );
    if (!isAllowedForBotButton) {
      return { action: 'error', message: '대기 채널 또는 자동방에서만 선택할 수 있습니다.' };
    }

    if (button.subOptions.length === 0) {
      return this.convertToConfirmedFromBot({
        guildId: dto.guildId,
        userId: dto.userId,
        displayName: dto.displayName,
        button,
      });
    }

    const sorted = [...button.subOptions].sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      action: 'show_sub_options',
      message: '선택지를 고르세요.',
      subOptions: sorted.map((opt) => ({
        id: opt.id,
        label: opt.label,
        emoji: opt.emoji,
      })),
    };
  }

  /**
   * Bot에서 호출: 2단계 하위 선택지 클릭 → 확정방 생성.
   */
  async handleSubOptionClickFromBot(
    dto: AutoChannelSubOptionDto,
  ): Promise<AutoChannelButtonResult> {
    if (!dto.voiceChannelId) {
      return { action: 'error', message: '음성 채널에 입장한 후 클릭하세요.' };
    }

    const subOption = await this.configRepo.findSubOptionById(dto.subOptionId);

    if (!subOption?.button?.config) {
      return { action: 'error', message: '설정을 찾을 수 없습니다. 관리자에게 문의하세요.' };
    }

    const isAllowedForBotSubOption = await this.isAllowedChannel(
      dto.voiceChannelId,
      subOption.button.config.id,
      subOption.button.config.triggerChannelId,
    );
    if (!isAllowedForBotSubOption) {
      return { action: 'error', message: '대기 채널 또는 자동방에서만 선택할 수 있습니다.' };
    }

    return this.convertToConfirmedFromBot({
      guildId: dto.guildId,
      userId: dto.userId,
      displayName: dto.displayName,
      button: subOption.button,
      subOption,
    });
  }

  /**
   * Bot 경로 전용 확정방 생성.
   * interaction 없이 채널 생성 + 유저 이동만 수행하고 결과를 반환한다.
   * 세션 추적은 Bot의 voiceStateUpdate 이벤트로 자연 처리된다.
   */
  private async convertToConfirmedFromBot({
    guildId,
    userId,
    displayName,
    button,
    subOption,
  }: {
    guildId: string;
    userId: string;
    displayName: string;
    button: AutoChannelButtonOrm;
    subOption?: AutoChannelSubOptionOrm;
  }): Promise<AutoChannelButtonResult> {
    const baseName = this.buildChannelName(displayName, button, subOption);
    const finalName = await this.resolveChannelName(guildId, button.targetCategoryId, baseName);

    const confirmedChannelId = await this.discordVoiceGateway.createVoiceChannel({
      guildId,
      name: finalName,
      parentCategoryId: button.targetCategoryId,
    });

    try {
      await this.discordVoiceGateway.moveUserToChannel(guildId, userId, confirmedChannelId);
    } catch (error) {
      // 이동 실패 시 고아 채널 정리
      await this.autoChannelRedis.deleteConfirmedState(confirmedChannelId).catch(() => {});
      await this.discordVoiceGateway.deleteChannel(confirmedChannelId).catch(() => {});
      this.logger.error(
        `[AUTO CHANNEL] Move failed, cleaned up orphan channel: guild=${guildId} channel=${confirmedChannelId}`,
        getErrorStack(error),
      );
      return { action: 'error', message: '채널 이동 중 오류가 발생했습니다. 다시 시도해주세요.' };
    }

    await this.autoChannelRedis.setConfirmedState(confirmedChannelId, {
      guildId,
      userId,
      configId: button.configId,
      buttonId: button.id,
      subOptionId: subOption?.id,
    });

    // Voice Redis에 auto-channel 메타데이터 캐싱 (F-VOICE-032)
    await this.cacheAutoChannelInfo({
      guildId,
      channelId: confirmedChannelId,
      configId: button.configId,
      configName: button.config.name,
      channelType: 'auto_select',
    });

    this.logger.log(
      `[AUTO CHANNEL] Confirmed (bot): guild=${guildId} user=${userId} channel="${finalName}"`,
    );

    return {
      action: 'created',
      channelId: confirmedChannelId,
      channelName: finalName,
      message: `**${finalName}** 방이 생성되었습니다!`,
    };
  }

  /**
   * 유저의 현재 음성 채널이 버튼 클릭을 허용하는 채널인지 검증한다.
   *
   * 허용 조건 (OR):
   *   1. 트리거 채널에 있음 (voiceChannelId === triggerChannelId)
   *   2. 해당 설정(configId)에 속한 확정방에 있음
   *      (Redis auto_channel:confirmed:{voiceChannelId}의 configId === 버튼의 configId)
   */
  private async isAllowedChannel(
    voiceChannelId: string,
    configId: number,
    triggerChannelId: string,
  ): Promise<boolean> {
    // 조건 1: 트리거 채널
    if (voiceChannelId === triggerChannelId) {
      return true;
    }

    // 조건 2: 해당 설정의 확정방
    const confirmedState = await this.autoChannelRedis.getConfirmedState(voiceChannelId);
    return confirmedState !== null && confirmedState.configId === configId;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 단위 C: instant 모드 즉시 생성 (F-VOICE-020)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * F-VOICE-020: 즉시 생성 모드 - 트리거 채널 입장 시 채널 즉시 생성 및 이동.
   *
   * 세션 추적은 유저 이동 후 발생하는 move 이벤트에서 자연 처리된다.
   */
  async handleInstantTriggerJoin({
    guildId,
    userId,
    triggerChannelId,
    displayName,
  }: {
    guildId: string;
    userId: string;
    triggerChannelId: string;
    displayName: string;
  }): Promise<void> {
    const config = await this.configRepo.findByTriggerChannel(guildId, triggerChannelId);

    if (!config) {
      this.logger.warn(
        `[AUTO CHANNEL] Instant: config not found for trigger channel: guild=${guildId} channel=${triggerChannelId}`,
      );
      return;
    }

    if (!config.instantCategoryId) {
      this.logger.warn(`[AUTO CHANNEL] Instant: instantCategoryId is null: configId=${config.id}`);
      return;
    }

    const template = config.instantNameTemplate ?? '{username}의 방';
    const baseName = this.buildInstantChannelName(displayName, template);
    const finalName = await this.resolveChannelName(guildId, config.instantCategoryId, baseName);

    let confirmedChannelId: string | undefined;
    try {
      confirmedChannelId = await this.discordVoiceGateway.createVoiceChannel({
        guildId,
        name: finalName,
        parentCategoryId: config.instantCategoryId,
      });

      await this.discordVoiceGateway.moveUserToChannel(guildId, userId, confirmedChannelId);

      await this.autoChannelRedis.setConfirmedState(confirmedChannelId, {
        guildId,
        userId,
        configId: config.id,
      });

      // Voice Redis에 auto-channel 메타데이터 캐싱 (F-VOICE-032)
      await this.cacheAutoChannelInfo({
        guildId,
        channelId: confirmedChannelId,
        configId: config.id,
        configName: config.name,
        channelType: 'auto_instant',
      });

      this.logger.log(
        `[AUTO CHANNEL] Instant confirmed: guild=${guildId} user=${userId} channel="${finalName}"`,
      );
    } catch (error) {
      this.logger.error(
        `[AUTO CHANNEL] Instant channel creation failed: guild=${guildId} user=${userId}`,
        getErrorStack(error),
      );
      // 채널 생성 후 이동 실패 시 고아 채널 정리
      if (confirmedChannelId) {
        await this.autoChannelRedis.deleteConfirmedState(confirmedChannelId).catch(() => {});
        await this.discordVoiceGateway.deleteChannel(confirmedChannelId).catch(() => {});
      }
    }
  }

  /**
   * Instant 모드 채널명 템플릿 적용.
   * {username}을 유저 닉네임으로 치환한다.
   */
  private buildInstantChannelName(displayName: string, template: string): string {
    return template.replace(/{username}/g, displayName);
  }

  /**
   * 확정방의 auto-channel 메타데이터를 Voice Redis에 캐싱한다 (F-VOICE-032).
   * flush 시점에 채널이 삭제된 뒤에도 조회할 수 있도록 7일 TTL로 저장.
   */
  private async cacheAutoChannelInfo({
    guildId,
    channelId,
    configId,
    configName,
    channelType,
  }: {
    guildId: string;
    channelId: string;
    configId: number;
    configName: string;
    channelType: 'auto_select' | 'auto_instant';
  }): Promise<void> {
    await this.voiceRedisRepository.setAutoChannelInfo(guildId, channelId, {
      configId,
      configName,
      channelType,
    });
  }

  /**
   * 확정방 Redis 키 삭제 후 Discord 채널 삭제.
   */
  private async deleteConfirmedChannel(
    channelId: string,
    state: AutoChannelConfirmedState,
  ): Promise<void> {
    await this.autoChannelRedis.deleteConfirmedState(channelId);

    try {
      await this.discordVoiceGateway.deleteChannel(channelId);
      this.logger.log(
        `[AUTO CHANNEL] Confirmed channel deleted: ${channelId} (guild=${state.guildId})`,
      );
    } catch (error) {
      this.logger.error(
        `[AUTO CHANNEL] Failed to delete confirmed channel: ${channelId}`,
        getErrorStack(error),
      );
    }
  }
}
