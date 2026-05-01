import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { AutoChannelService } from '../../channel/auto/application/auto-channel.service';
import { AutoChannelConfigRepository } from '../../channel/auto/infrastructure/auto-channel-config.repository';
import { VoiceChannelService } from '../../channel/voice/application/voice-channel.service';
import { VoiceExcludedChannelService } from '../../channel/voice/application/voice-excluded-channel.service';
import { VoiceGameService } from '../../channel/voice/application/voice-game.service';
import { VoiceSessionService } from '../../channel/voice/application/voice-session.service';
import { VoiceStateDto } from '../../channel/voice/infrastructure/voice-state.dto';
import { getErrorStack } from '../../common/util/error.util';
import { StatusPrefixResetService } from '../../status-prefix/application/status-prefix-reset.service';

/**
 * Bot → API voice state-update 이벤트를 수신하여 기존 서비스 메서드를 호출한다.
 * 기존 VoiceStateDispatcher + VoiceJoin/Leave/Move/MicToggle/AloneHandler의 로직을 통합.
 */
@Injectable()
export class BotVoiceEventListener {
  private readonly logger = new Logger(BotVoiceEventListener.name);

  constructor(
    private readonly voiceChannelService: VoiceChannelService,
    private readonly voiceSessionService: VoiceSessionService,
    private readonly excludedChannelService: VoiceExcludedChannelService,
    private readonly statusPrefixResetService: StatusPrefixResetService,
    private readonly autoChannelService: AutoChannelService,
    private readonly autoChannelConfigRepo: AutoChannelConfigRepository,
    private readonly voiceGameService: VoiceGameService,
  ) {}

  @OnEvent('bot-api.voice.state-update')
  async handle(dto: VoiceStateUpdateEventDto): Promise<void> {
    try {
      switch (dto.eventType) {
        case 'join':
          await this.handleJoin(dto);
          break;
        case 'leave':
          await this.handleLeave(dto);
          break;
        case 'move':
          await this.handleMove(dto);
          break;
        case 'mic_toggle':
          await this.handleMicToggle(dto);
          break;
        case 'streaming_toggle':
          await this.handleStreamingToggle(dto);
          break;
        case 'video_toggle':
          await this.handleVideoToggle(dto);
          break;
        case 'deaf_toggle':
          await this.handleDeafToggle(dto);
          break;
      }
    } catch (err) {
      this.logger.error(
        `[BOT-API VOICE] ${dto.eventType} failed: guild=${dto.guildId} user=${dto.userId}`,
        getErrorStack(err),
      );
    }
  }

  private async handleJoin(dto: VoiceStateUpdateEventDto): Promise<void> {
    if (!dto.channelId) return;

    const isExcluded = await this.excludedChannelService.isExcludedChannel(
      dto.guildId,
      dto.channelId,
      dto.parentCategoryId,
    );
    if (isExcluded) return;

    // 트리거 채널 여부 확인 및 모드 분기
    const config = await this.autoChannelConfigRepo.findByTriggerChannel(
      dto.guildId,
      dto.channelId,
    );
    if (config) {
      if (config.mode === 'instant') {
        await this.autoChannelService.handleInstantTriggerJoin({
          guildId: dto.guildId,
          userId: dto.userId,
          triggerChannelId: dto.channelId,
          displayName: dto.userName,
        });
      }
      // select 모드: 안내 메시지 버튼 클릭 대기 — 세션 추적 skip
      return;
    }

    // 자동방에 사용자가 다시 입장한 경우 sweep 재시도 대상에서 해제 (활성 사용자 강퇴 방지)
    this.autoChannelService.clearPendingDelete(dto.channelId).catch((err) => {
      this.logger.warn(
        `[AUTO_CHANNEL] clearPendingDelete failed: channel=${dto.channelId} ${getErrorStack(err)}`,
      );
    });

    const state = this.buildStateDto(dto, false);
    await this.voiceChannelService.onUserJoined(state);

    // Phase 2: 게임 세션 시작 (fire-and-forget)
    if (dto.gameName) {
      this.voiceGameService
        // join 이벤트이므로 handleJoin 진입 시 `if (!dto.channelId) return` 가드 통과 보장
        .onUserJoined(dto.guildId, dto.userId, dto.channelId!, {
          gameName: dto.gameName,
          applicationId: dto.gameApplicationId ?? null,
        })
        .catch((err) => this.logger.error('[VOICE GAME] onUserJoined failed', getErrorStack(err)));
    }

    // alone 상태 갱신
    this.emitAloneChanged(dto.guildId, dto.channelMemberIds);
  }

  private async handleLeave(dto: VoiceStateUpdateEventDto): Promise<void> {
    if (!dto.oldChannelId) return;

    const isExcluded = await this.excludedChannelService.isExcludedChannel(
      dto.guildId,
      dto.oldChannelId,
      dto.oldParentCategoryId,
    );
    if (isExcluded) return;

    const state = this.buildStateDto(dto, true);
    await this.voiceChannelService.onUserLeave(state);

    // Phase 2: 게임 세션 종료 (fire-and-forget)
    this.voiceGameService
      .onUserLeft(dto.guildId, dto.userId)
      .catch((err) => this.logger.error('[VOICE GAME] onUserLeft failed', getErrorStack(err)));

    // Status Prefix 닉네임 자동 복원 (fire-and-forget)
    this.statusPrefixResetService
      .restoreOnLeave(dto.guildId, dto.userId)
      .catch((err) =>
        this.logger.error('[STATUS_PREFIX] restoreOnLeave failed', getErrorStack(err)),
      );

    // alone 상태 갱신 (이전 채널 기준)
    this.emitAloneChanged(dto.guildId, dto.oldChannelMemberIds);

    // 빈 채널 감지 → 자동방 삭제 (fire-and-forget)
    if (dto.oldChannelMemberCount === 0) {
      this.autoChannelService
        .handleChannelEmpty(dto.guildId, dto.oldChannelId)
        .catch((err) =>
          this.logger.error('[AUTO_CHANNEL] handleChannelEmpty failed', getErrorStack(err)),
        );
    }
  }

  private async handleMove(dto: VoiceStateUpdateEventDto): Promise<void> {
    if (!dto.oldChannelId || !dto.channelId) return;

    const oldExcluded = await this.excludedChannelService.isExcludedChannel(
      dto.guildId,
      dto.oldChannelId,
      dto.oldParentCategoryId,
    );
    const newExcluded = await this.excludedChannelService.isExcludedChannel(
      dto.guildId,
      dto.channelId,
      dto.parentCategoryId,
    );

    // 새 채널이 트리거 채널인지 확인
    const triggerConfig = newExcluded
      ? null
      : await this.autoChannelConfigRepo.findByTriggerChannel(dto.guildId, dto.channelId);

    if (triggerConfig) {
      // 이전 채널 leave 처리 (세션 종료, status prefix 복원)
      if (!oldExcluded) {
        const oldState = this.buildStateDto(dto, true);
        await this.voiceChannelService.onUserLeave(oldState);

        this.statusPrefixResetService
          .restoreOnLeave(dto.guildId, dto.userId)
          .catch((err) =>
            this.logger.error('[STATUS_PREFIX] restoreOnLeave failed', getErrorStack(err)),
          );
      }

      if (triggerConfig.mode === 'instant') {
        // instant 모드: 즉시 채널 생성 + 이동 (이동 후 move 이벤트로 세션 추적 자연 처리)
        await this.autoChannelService.handleInstantTriggerJoin({
          guildId: dto.guildId,
          userId: dto.userId,
          triggerChannelId: dto.channelId,
          displayName: dto.userName,
        });
      }
      // select 모드: 안내 메시지 버튼 클릭 대기 — 세션 추적 skip

      // alone 상태 갱신 (이전 채널)
      this.emitAloneChanged(dto.guildId, dto.oldChannelMemberIds);

      // 이전 채널이 비어있으면 자동방 삭제 (fire-and-forget)
      if (dto.oldChannelMemberCount === 0) {
        this.autoChannelService
          .handleChannelEmpty(dto.guildId, dto.oldChannelId)
          .catch((err) =>
            this.logger.error('[AUTO_CHANNEL] handleChannelEmpty failed', getErrorStack(err)),
          );
      }
      return;
    }

    if (!oldExcluded && !newExcluded) {
      // 둘 다 일반 채널 — MOVE
      const oldState = this.buildStateDto(dto, true);
      const newState = this.buildStateDto(dto, false);
      await this.voiceChannelService.onUserMove(oldState, newState);
    } else if (oldExcluded && !newExcluded) {
      // 제외 → 일반 — JOIN만
      const state = this.buildStateDto(dto, false);
      await this.voiceChannelService.onUserJoined(state);
    } else if (!oldExcluded && newExcluded) {
      // 일반 → 제외 — LEAVE만
      const state = this.buildStateDto(dto, true);
      await this.voiceChannelService.onUserLeave(state);

      this.statusPrefixResetService
        .restoreOnLeave(dto.guildId, dto.userId)
        .catch((err) =>
          this.logger.error('[STATUS_PREFIX] restoreOnLeave failed', getErrorStack(err)),
        );
    }
    // 둘 다 제외 — 무시

    // alone 상태 갱신 (양쪽 채널)
    this.emitAloneChanged(dto.guildId, dto.oldChannelMemberIds);
    this.emitAloneChanged(dto.guildId, dto.channelMemberIds);

    // 이전 채널이 비어있으면 자동방 삭제 (fire-and-forget)
    if (dto.oldChannelMemberCount === 0) {
      this.autoChannelService
        .handleChannelEmpty(dto.guildId, dto.oldChannelId)
        .catch((err) =>
          this.logger.error('[AUTO_CHANNEL] handleChannelEmpty failed', getErrorStack(err)),
        );
    }
  }

  private async handleMicToggle(dto: VoiceStateUpdateEventDto): Promise<void> {
    if (!dto.channelId) return;

    const isExcluded = await this.excludedChannelService.isExcludedChannel(
      dto.guildId,
      dto.channelId,
      dto.parentCategoryId,
    );
    if (isExcluded) return;

    const state = this.buildStateDto(dto, false);
    await this.voiceChannelService.onUserMicToggle(state);
  }

  private async handleStreamingToggle(dto: VoiceStateUpdateEventDto): Promise<void> {
    if (!dto.channelId) return;

    const isExcluded = await this.excludedChannelService.isExcludedChannel(
      dto.guildId,
      dto.channelId,
      dto.parentCategoryId,
    );
    if (isExcluded) return;

    const state = this.buildStateDto(dto, false);
    await this.voiceChannelService.onUserStreamingToggle(state);
  }

  private async handleVideoToggle(dto: VoiceStateUpdateEventDto): Promise<void> {
    if (!dto.channelId) return;

    const isExcluded = await this.excludedChannelService.isExcludedChannel(
      dto.guildId,
      dto.channelId,
      dto.parentCategoryId,
    );
    if (isExcluded) return;

    const state = this.buildStateDto(dto, false);
    await this.voiceChannelService.onUserVideoToggle(state);
  }

  private async handleDeafToggle(dto: VoiceStateUpdateEventDto): Promise<void> {
    if (!dto.channelId) return;

    const isExcluded = await this.excludedChannelService.isExcludedChannel(
      dto.guildId,
      dto.channelId,
      dto.parentCategoryId,
    );
    if (isExcluded) return;

    const state = this.buildStateDto(dto, false);
    await this.voiceChannelService.onUserDeafToggle(state);
  }

  /** 채널 멤버 2명 이하일 때 alone 상태 갱신 */
  private emitAloneChanged(guildId: string, memberIds: string[]): void {
    if (memberIds.length > 2) return;
    const isAlone = memberIds.length === 1;

    this.voiceSessionService
      .updateAloneForChannel(guildId, memberIds, isAlone)
      .catch((err) =>
        this.logger.error('[VOICE] updateAloneForChannel failed', getErrorStack(err)),
      );
  }

  /** DTO로부터 VoiceStateDto 구성 */
  private buildStateDto(dto: VoiceStateUpdateEventDto, useOld: boolean): VoiceStateDto {
    return new VoiceStateDto(
      dto.guildId,
      dto.userId,
      // 각 핸들러(handleJoin/handleLeave/handleMove)에서 channelId/oldChannelId null 가드 후 호출됨
      useOld ? dto.oldChannelId! : dto.channelId!,
      dto.userName,
      useOld ? (dto.oldChannelName ?? '') : (dto.channelName ?? ''),
      useOld ? dto.oldParentCategoryId : dto.parentCategoryId,
      useOld ? dto.oldCategoryName : dto.categoryName,
      dto.micOn,
      (useOld ? dto.oldChannelMemberCount : dto.channelMemberCount) === 1,
      useOld ? dto.oldChannelMemberCount : dto.channelMemberCount,
      dto.avatarUrl,
      dto.streaming ?? false,
      dto.selfVideo ?? false,
      dto.selfDeaf ?? false,
    );
  }
}

/** 리스너에서 사용하는 DTO 타입 (bot-api-client의 VoiceStateUpdateDto와 동일 구조) */
interface VoiceStateUpdateEventDto {
  guildId: string;
  userId: string;
  channelId: string | null;
  oldChannelId: string | null;
  eventType:
    | 'join'
    | 'leave'
    | 'move'
    | 'mic_toggle'
    | 'streaming_toggle'
    | 'video_toggle'
    | 'deaf_toggle';
  userName: string;
  channelName: string | null;
  oldChannelName: string | null;
  parentCategoryId: string | null;
  categoryName: string | null;
  oldParentCategoryId: string | null;
  oldCategoryName: string | null;
  micOn: boolean;
  avatarUrl: string | null;
  channelMemberCount: number;
  oldChannelMemberCount: number;
  channelMemberIds: string[];
  oldChannelMemberIds: string[];

  // Phase 1
  streaming?: boolean;
  selfVideo?: boolean;
  selfDeaf?: boolean;

  // Phase 2
  gameName?: string | null;
  gameApplicationId?: string | null;
}
