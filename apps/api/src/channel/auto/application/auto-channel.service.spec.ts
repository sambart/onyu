import { type Mock } from 'vitest';

import type { VoiceChannelService } from '../../voice/application/voice-channel.service';
import type { DiscordVoiceGateway } from '../../voice/infrastructure/discord-voice.gateway';
import type { VoiceRedisRepository } from '../../voice/infrastructure/voice-redis.repository';
import type { AutoChannelConfigRepository } from '../infrastructure/auto-channel-config.repository';
import type { AutoChannelDiscordGateway } from '../infrastructure/auto-channel-discord.gateway';
import type { AutoChannelRedisRepository } from '../infrastructure/auto-channel-redis.repository';
import type { AutoChannelConfirmedState } from '../infrastructure/auto-channel-state';
import { AutoChannelService } from './auto-channel.service';

// ──────────────────────────────────────────────────────────────
// 헬퍼 팩토리
// ──────────────────────────────────────────────────────────────

function makeConfig(
  overrides: Partial<{
    id: number;
    guildId: string;
    triggerChannelId: string;
    mode: 'select' | 'instant';
    instantCategoryId: string | null;
    instantNameTemplate: string | null;
    guideChannelId: string | null;
    guideMessage: string | null;
    guideMessageId: string | null;
    embedTitle: string | null;
    embedColor: string | null;
    buttons: unknown[];
  }> = {},
) {
  return {
    id: 1,
    guildId: 'guild-1',
    triggerChannelId: 'trigger-ch-1',
    mode: 'instant' as const,
    instantCategoryId: 'cat-instant-1',
    instantNameTemplate: '{username}의 방',
    guideChannelId: null,
    guideMessage: null,
    guideMessageId: null,
    embedTitle: null,
    embedColor: null,
    buttons: [],
    ...overrides,
  };
}

function makeButton(
  overrides: Partial<{
    id: number;
    configId: number;
    label: string;
    targetCategoryId: string;
    channelNameTemplate: string | null;
    sortOrder: number;
    subOptions: unknown[];
    config: ReturnType<typeof makeConfig>;
  }> = {},
) {
  const config = makeConfig({ mode: 'select', id: overrides.configId ?? 1 });
  return {
    id: 10,
    configId: config.id,
    label: '오버워치',
    targetCategoryId: 'cat-1',
    channelNameTemplate: null,
    sortOrder: 0,
    subOptions: [],
    config,
    ...overrides,
  };
}

function makeSubOption(
  overrides: Partial<{
    id: number;
    buttonId: number;
    label: string;
    channelNameTemplate: string;
    sortOrder: number;
    button: unknown;
  }> = {},
) {
  const button = makeButton();
  return {
    id: 20,
    buttonId: button.id,
    label: '서버1',
    channelNameTemplate: '{name} #{n}',
    sortOrder: 0,
    button,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────
// 테스트 셋업
// ──────────────────────────────────────────────────────────────

describe('AutoChannelService', () => {
  let service: AutoChannelService;
  let configRepo: {
    findById: Mock;
    findByTriggerChannel: Mock;
    findButtonById: Mock;
    findSubOptionById: Mock;
    updateGuideMessageId: Mock;
  };
  let autoChannelRedis: {
    setConfirmedState: Mock;
    getConfirmedState: Mock;
    deleteConfirmedState: Mock;
  };
  let discordVoiceGateway: {
    createVoiceChannel: Mock;
    moveUserToChannel: Mock;
    deleteChannel: Mock;
  };
  let autoChannelDiscordGateway: {
    fetchVoiceChannelNamesByCategory: Mock;
    editGuideMessage: Mock;
    sendGuideMessage: Mock;
  };
  let voiceChannelService: {
    onUserJoined: Mock;
  };
  let voiceRedisRepository: {
    setAutoChannelInfo: Mock;
  };

  beforeEach(() => {
    configRepo = {
      findById: vi.fn(),
      findByTriggerChannel: vi.fn(),
      findButtonById: vi.fn(),
      findSubOptionById: vi.fn(),
      updateGuideMessageId: vi.fn().mockResolvedValue(undefined),
    };
    autoChannelRedis = {
      setConfirmedState: vi.fn().mockResolvedValue(undefined),
      getConfirmedState: vi.fn().mockResolvedValue(null),
      deleteConfirmedState: vi.fn().mockResolvedValue(undefined),
    };
    discordVoiceGateway = {
      createVoiceChannel: vi.fn().mockResolvedValue('new-ch-id'),
      moveUserToChannel: vi.fn().mockResolvedValue(undefined),
      deleteChannel: vi.fn().mockResolvedValue(undefined),
    };
    autoChannelDiscordGateway = {
      fetchVoiceChannelNamesByCategory: vi.fn().mockResolvedValue([]),
      editGuideMessage: vi.fn().mockResolvedValue(null),
      sendGuideMessage: vi.fn().mockResolvedValue('msg-id'),
    };
    voiceChannelService = {
      onUserJoined: vi.fn().mockResolvedValue(undefined),
    };
    voiceRedisRepository = {
      setAutoChannelInfo: vi.fn().mockResolvedValue(undefined),
    };

    service = new AutoChannelService(
      configRepo as unknown as AutoChannelConfigRepository,
      autoChannelRedis as unknown as AutoChannelRedisRepository,
      discordVoiceGateway as unknown as DiscordVoiceGateway,
      autoChannelDiscordGateway as unknown as AutoChannelDiscordGateway,
      voiceChannelService as unknown as VoiceChannelService,
      voiceRedisRepository as unknown as VoiceRedisRepository,
    );
  });

  // ────────────────────────────────────────────────────────────
  // handleInstantTriggerJoin
  // ────────────────────────────────────────────────────────────

  describe('handleInstantTriggerJoin', () => {
    it('정상: config 조회 → 채널 생성 → 유저 이동 → Redis 저장 순서로 실행된다', async () => {
      const config = makeConfig({
        id: 1,
        instantCategoryId: 'cat-instant',
        instantNameTemplate: '{username}의 방',
      });
      configRepo.findByTriggerChannel.mockResolvedValue(config);
      discordVoiceGateway.createVoiceChannel.mockResolvedValue('confirmed-ch');

      await service.handleInstantTriggerJoin({
        guildId: 'guild-1',
        userId: 'user-1',
        triggerChannelId: 'trigger-ch-1',
        displayName: 'Onyu',
      });

      expect(configRepo.findByTriggerChannel).toHaveBeenCalledWith('guild-1', 'trigger-ch-1');
      expect(discordVoiceGateway.createVoiceChannel).toHaveBeenCalledWith({
        guildId: 'guild-1',
        name: 'Onyu의 방',
        parentCategoryId: 'cat-instant',
      });
      expect(discordVoiceGateway.moveUserToChannel).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        'confirmed-ch',
      );
      expect(autoChannelRedis.setConfirmedState).toHaveBeenCalledWith('confirmed-ch', {
        guildId: 'guild-1',
        userId: 'user-1',
        configId: 1,
      });
    });

    it('config가 없으면 채널 생성 없이 조기 종료한다', async () => {
      configRepo.findByTriggerChannel.mockResolvedValue(null);

      await service.handleInstantTriggerJoin({
        guildId: 'guild-1',
        userId: 'user-1',
        triggerChannelId: 'trigger-ch-1',
        displayName: 'Onyu',
      });

      expect(discordVoiceGateway.createVoiceChannel).not.toHaveBeenCalled();
      expect(autoChannelRedis.setConfirmedState).not.toHaveBeenCalled();
    });

    it('instantCategoryId가 null이면 채널 생성 없이 조기 종료한다', async () => {
      const config = makeConfig({ instantCategoryId: null });
      configRepo.findByTriggerChannel.mockResolvedValue(config);

      await service.handleInstantTriggerJoin({
        guildId: 'guild-1',
        userId: 'user-1',
        triggerChannelId: 'trigger-ch-1',
        displayName: 'Onyu',
      });

      expect(discordVoiceGateway.createVoiceChannel).not.toHaveBeenCalled();
    });

    it('채널명 템플릿 {username}을 displayName으로 치환한다', async () => {
      const config = makeConfig({ instantNameTemplate: '{username}님의 게임방' });
      configRepo.findByTriggerChannel.mockResolvedValue(config);

      await service.handleInstantTriggerJoin({
        guildId: 'guild-1',
        userId: 'user-1',
        triggerChannelId: 'trigger-ch-1',
        displayName: 'Onyu',
      });

      expect(discordVoiceGateway.createVoiceChannel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Onyu님의 게임방' }),
      );
    });

    it('instantNameTemplate이 null이면 기본값 "{username}의 방"을 사용한다', async () => {
      const config = makeConfig({ instantNameTemplate: null });
      configRepo.findByTriggerChannel.mockResolvedValue(config);

      await service.handleInstantTriggerJoin({
        guildId: 'guild-1',
        userId: 'user-1',
        triggerChannelId: 'trigger-ch-1',
        displayName: 'Onyu',
      });

      expect(discordVoiceGateway.createVoiceChannel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Onyu의 방' }),
      );
    });

    it('{n} 순번 처리: 같은 이름의 채널이 이미 있으면 {n}을 증가시켜 이름을 결정한다', async () => {
      const config = makeConfig({ instantNameTemplate: '게임방 #{n}' });
      configRepo.findByTriggerChannel.mockResolvedValue(config);
      autoChannelDiscordGateway.fetchVoiceChannelNamesByCategory.mockResolvedValue([
        '게임방 #1',
        '게임방 #2',
      ]);

      await service.handleInstantTriggerJoin({
        guildId: 'guild-1',
        userId: 'user-1',
        triggerChannelId: 'trigger-ch-1',
        displayName: 'Onyu',
      });

      expect(discordVoiceGateway.createVoiceChannel).toHaveBeenCalledWith(
        expect.objectContaining({ name: '게임방 #3' }),
      );
    });

    it('{n} 없이 중복 채널명이면 숫자 접미사를 붙여 이름을 결정한다', async () => {
      const config = makeConfig({ instantNameTemplate: '{username}의 방' });
      configRepo.findByTriggerChannel.mockResolvedValue(config);
      autoChannelDiscordGateway.fetchVoiceChannelNamesByCategory.mockResolvedValue(['Onyu의 방']);

      await service.handleInstantTriggerJoin({
        guildId: 'guild-1',
        userId: 'user-1',
        triggerChannelId: 'trigger-ch-1',
        displayName: 'Onyu',
      });

      expect(discordVoiceGateway.createVoiceChannel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Onyu의 방 2' }),
      );
    });

    it('Redis 저장 시 buttonId, subOptionId가 포함되지 않는다 (instant 모드는 미사용)', async () => {
      const config = makeConfig({ id: 42 });
      configRepo.findByTriggerChannel.mockResolvedValue(config);
      discordVoiceGateway.createVoiceChannel.mockResolvedValue('ch-instant');

      await service.handleInstantTriggerJoin({
        guildId: 'guild-1',
        userId: 'user-99',
        triggerChannelId: 'trigger-ch-1',
        displayName: 'Onyu',
      });

      const call = autoChannelRedis.setConfirmedState.mock.calls[0][1] as AutoChannelConfirmedState;
      expect(call.configId).toBe(42);
      expect('buttonId' in call).toBe(false);
      expect('subOptionId' in call).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // isAllowedChannel (private → handleButtonClickFromBot을 통해 간접 검증)
  // ────────────────────────────────────────────────────────────

  describe('isAllowedChannel (handleButtonClickFromBot을 통한 간접 검증)', () => {
    it('트리거 채널 ID 일치 시 허용된다 (Redis 조회 없음)', async () => {
      const button = makeButton({ id: 10, configId: 1 });
      button.config.triggerChannelId = 'trigger-ch';
      configRepo.findButtonById.mockResolvedValue(button);
      discordVoiceGateway.createVoiceChannel.mockResolvedValue('new-ch');

      const result = await service.handleButtonClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        buttonId: 10,
        voiceChannelId: 'trigger-ch',
      });

      expect(autoChannelRedis.getConfirmedState).not.toHaveBeenCalled();
      expect(result.action).toBe('created');
    });

    it('확정방에 있고 configId가 일치하면 허용된다', async () => {
      const button = makeButton({ id: 10, configId: 5 });
      button.config.id = 5;
      button.config.triggerChannelId = 'trigger-ch';
      configRepo.findButtonById.mockResolvedValue(button);
      autoChannelRedis.getConfirmedState.mockResolvedValue({
        guildId: 'guild-1',
        userId: 'user-1',
        configId: 5,
      } satisfies AutoChannelConfirmedState);
      discordVoiceGateway.createVoiceChannel.mockResolvedValue('new-ch');

      const result = await service.handleButtonClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        buttonId: 10,
        voiceChannelId: 'confirmed-ch',
      });

      expect(autoChannelRedis.getConfirmedState).toHaveBeenCalledWith('confirmed-ch');
      expect(result.action).toBe('created');
    });

    it('확정방에 있지만 configId가 불일치하면 오류를 반환한다', async () => {
      const button = makeButton({ id: 10, configId: 5 });
      button.config.id = 5;
      button.config.triggerChannelId = 'trigger-ch';
      configRepo.findButtonById.mockResolvedValue(button);
      autoChannelRedis.getConfirmedState.mockResolvedValue({
        guildId: 'guild-1',
        userId: 'user-1',
        configId: 999, // 다른 configId
      } satisfies AutoChannelConfirmedState);

      const result = await service.handleButtonClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        buttonId: 10,
        voiceChannelId: 'confirmed-ch-other',
      });

      expect(result.action).toBe('error');
      expect(result.message).toBe('대기 채널 또는 자동방에서만 선택할 수 있습니다.');
    });

    it('확정방이 아닌 일반 채널(Redis null)에서 클릭 시 오류를 반환한다', async () => {
      const button = makeButton({ id: 10 });
      button.config.triggerChannelId = 'trigger-ch';
      configRepo.findButtonById.mockResolvedValue(button);
      autoChannelRedis.getConfirmedState.mockResolvedValue(null);

      const result = await service.handleButtonClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        buttonId: 10,
        voiceChannelId: 'some-other-ch',
      });

      expect(result.action).toBe('error');
      expect(result.message).toBe('대기 채널 또는 자동방에서만 선택할 수 있습니다.');
    });
  });

  // ────────────────────────────────────────────────────────────
  // convertToConfirmed에서 configId 포함 여부 검증
  // ────────────────────────────────────────────────────────────

  describe('convertToConfirmedFromBot - Redis 저장 시 configId 포함', () => {
    it('버튼의 configId가 Redis 저장 state에 포함된다', async () => {
      const button = makeButton({ id: 10, configId: 77 });
      button.config.id = 77;
      button.config.triggerChannelId = 'trigger-ch';
      configRepo.findButtonById.mockResolvedValue(button);
      discordVoiceGateway.createVoiceChannel.mockResolvedValue('confirmed-ch');

      await service.handleButtonClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        buttonId: 10,
        voiceChannelId: 'trigger-ch',
      });

      expect(autoChannelRedis.setConfirmedState).toHaveBeenCalledWith(
        'confirmed-ch',
        expect.objectContaining({ configId: 77 }),
      );
    });

    it('subOption 클릭 시 버튼의 configId가 Redis 저장 state에 포함된다', async () => {
      const button = makeButton({ id: 10, configId: 88 });
      button.config.id = 88;
      button.config.triggerChannelId = 'trigger-ch';
      const subOption = makeSubOption({ id: 20, button });
      configRepo.findSubOptionById.mockResolvedValue(subOption);
      discordVoiceGateway.createVoiceChannel.mockResolvedValue('confirmed-ch');

      await service.handleSubOptionClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        subOptionId: 20,
        voiceChannelId: 'trigger-ch',
      });

      expect(autoChannelRedis.setConfirmedState).toHaveBeenCalledWith(
        'confirmed-ch',
        expect.objectContaining({ configId: 88 }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // handleButtonClickFromBot
  // ────────────────────────────────────────────────────────────

  describe('handleButtonClickFromBot', () => {
    it('voiceChannelId가 null이면 오류 메시지를 반환한다', async () => {
      const result = await service.handleButtonClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        buttonId: 10,
        voiceChannelId: null,
      });

      expect(result.action).toBe('error');
      expect(result.message).toBe('음성 채널에 입장한 후 클릭하세요.');
    });

    it('버튼이 존재하지 않으면 오류 메시지를 반환한다', async () => {
      configRepo.findButtonById.mockResolvedValue(null);

      const result = await service.handleButtonClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        buttonId: 99,
        voiceChannelId: 'trigger-ch',
      });

      expect(result.action).toBe('error');
      expect(result.message).toBe('설정을 찾을 수 없습니다. 관리자에게 문의하세요.');
    });

    it('트리거 채널에서 클릭 시 created 액션을 반환한다 (하위 선택지 없음)', async () => {
      const button = makeButton({ subOptions: [] });
      button.config.triggerChannelId = 'trigger-ch';
      configRepo.findButtonById.mockResolvedValue(button);
      discordVoiceGateway.createVoiceChannel.mockResolvedValue('new-ch');

      const result = await service.handleButtonClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        buttonId: 10,
        voiceChannelId: 'trigger-ch',
      });

      expect(result.action).toBe('created');
    });

    it('하위 선택지가 있으면 show_sub_options 액션을 반환한다', async () => {
      const subOpt1 = { id: 1, label: '서버1', emoji: null, sortOrder: 0 };
      const subOpt2 = { id: 2, label: '서버2', emoji: null, sortOrder: 1 };
      const button = makeButton({ subOptions: [subOpt1, subOpt2] });
      button.config.triggerChannelId = 'trigger-ch';
      configRepo.findButtonById.mockResolvedValue(button);

      const result = await service.handleButtonClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        buttonId: 10,
        voiceChannelId: 'trigger-ch',
      });

      expect(result.action).toBe('show_sub_options');
      if (result.action === 'show_sub_options') {
        expect(result.subOptions).toHaveLength(2);
      }
    });

    it('같은 configId 확정방에서 클릭 시 새 채널을 생성한다', async () => {
      const button = makeButton({ id: 10, configId: 5 });
      button.config.id = 5;
      button.config.triggerChannelId = 'trigger-ch';
      configRepo.findButtonById.mockResolvedValue(button);
      autoChannelRedis.getConfirmedState.mockResolvedValue({
        guildId: 'guild-1',
        userId: 'user-1',
        configId: 5,
      } satisfies AutoChannelConfirmedState);
      discordVoiceGateway.createVoiceChannel.mockResolvedValue('new-confirmed-ch');

      const result = await service.handleButtonClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        buttonId: 10,
        voiceChannelId: 'current-confirmed-ch',
      });

      expect(result.action).toBe('created');
      expect(discordVoiceGateway.createVoiceChannel).toHaveBeenCalledOnce();
    });

    it('다른 configId 확정방에서 클릭 시 오류를 반환한다', async () => {
      const button = makeButton({ id: 10, configId: 5 });
      button.config.id = 5;
      button.config.triggerChannelId = 'trigger-ch';
      configRepo.findButtonById.mockResolvedValue(button);
      autoChannelRedis.getConfirmedState.mockResolvedValue({
        guildId: 'guild-1',
        userId: 'user-1',
        configId: 999,
      } satisfies AutoChannelConfirmedState);

      const result = await service.handleButtonClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        buttonId: 10,
        voiceChannelId: 'other-confirmed-ch',
      });

      expect(result.action).toBe('error');
      expect(result.message).toBe('대기 채널 또는 자동방에서만 선택할 수 있습니다.');
    });
  });

  // ────────────────────────────────────────────────────────────
  // handleSubOptionClickFromBot
  // ────────────────────────────────────────────────────────────

  describe('handleSubOptionClickFromBot', () => {
    it('voiceChannelId가 null이면 오류 메시지를 반환한다', async () => {
      const result = await service.handleSubOptionClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        subOptionId: 20,
        voiceChannelId: null,
      });

      expect(result.action).toBe('error');
      expect(result.message).toBe('음성 채널에 입장한 후 클릭하세요.');
    });

    it('하위 선택지가 존재하지 않으면 오류 메시지를 반환한다', async () => {
      configRepo.findSubOptionById.mockResolvedValue(null);

      const result = await service.handleSubOptionClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        subOptionId: 99,
        voiceChannelId: 'trigger-ch',
      });

      expect(result.action).toBe('error');
      expect(result.message).toBe('설정을 찾을 수 없습니다. 관리자에게 문의하세요.');
    });

    it('트리거 채널에서 클릭 시 created 액션을 반환한다', async () => {
      const button = makeButton({ id: 10 });
      button.config.triggerChannelId = 'trigger-ch';
      const subOption = makeSubOption({ id: 20, button });
      configRepo.findSubOptionById.mockResolvedValue(subOption);
      discordVoiceGateway.createVoiceChannel.mockResolvedValue('new-ch');

      const result = await service.handleSubOptionClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        subOptionId: 20,
        voiceChannelId: 'trigger-ch',
      });

      expect(result.action).toBe('created');
    });

    it('같은 configId 확정방에서 클릭 시 새 채널을 생성한다', async () => {
      const button = makeButton({ id: 10, configId: 7 });
      button.config.id = 7;
      button.config.triggerChannelId = 'trigger-ch';
      const subOption = makeSubOption({ id: 20, button });
      configRepo.findSubOptionById.mockResolvedValue(subOption);
      autoChannelRedis.getConfirmedState.mockResolvedValue({
        guildId: 'guild-1',
        userId: 'user-1',
        configId: 7,
      } satisfies AutoChannelConfirmedState);
      discordVoiceGateway.createVoiceChannel.mockResolvedValue('new-ch');

      const result = await service.handleSubOptionClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        subOptionId: 20,
        voiceChannelId: 'current-confirmed-ch',
      });

      expect(result.action).toBe('created');
    });

    it('다른 configId 확정방에서 클릭 시 오류를 반환한다', async () => {
      const button = makeButton({ id: 10, configId: 7 });
      button.config.id = 7;
      button.config.triggerChannelId = 'trigger-ch';
      const subOption = makeSubOption({ id: 20, button });
      configRepo.findSubOptionById.mockResolvedValue(subOption);
      autoChannelRedis.getConfirmedState.mockResolvedValue({
        guildId: 'guild-1',
        userId: 'user-1',
        configId: 999,
      } satisfies AutoChannelConfirmedState);

      const result = await service.handleSubOptionClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        subOptionId: 20,
        voiceChannelId: 'other-confirmed-ch',
      });

      expect(result.action).toBe('error');
      expect(result.message).toBe('대기 채널 또는 자동방에서만 선택할 수 있습니다.');
    });

    it('일반 채널(Redis null)에서 클릭 시 오류를 반환한다', async () => {
      const button = makeButton({ id: 10 });
      button.config.triggerChannelId = 'trigger-ch';
      const subOption = makeSubOption({ id: 20, button });
      configRepo.findSubOptionById.mockResolvedValue(subOption);
      autoChannelRedis.getConfirmedState.mockResolvedValue(null);

      const result = await service.handleSubOptionClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        subOptionId: 20,
        voiceChannelId: 'some-ch',
      });

      expect(result.action).toBe('error');
      expect(result.message).toBe('대기 채널 또는 자동방에서만 선택할 수 있습니다.');
    });
  });

  // ────────────────────────────────────────────────────────────
  // sendOrUpdateGuideMessage - instant 모드 early return
  // ────────────────────────────────────────────────────────────

  describe('sendOrUpdateGuideMessage', () => {
    it('instant 모드 config이면 안내 메시지를 전송하지 않고 조기 종료한다', async () => {
      const config = makeConfig({ mode: 'instant' });
      configRepo.findById.mockResolvedValue(config);

      await service.sendOrUpdateGuideMessage(1);

      expect(autoChannelDiscordGateway.sendGuideMessage).not.toHaveBeenCalled();
      expect(autoChannelDiscordGateway.editGuideMessage).not.toHaveBeenCalled();
      expect(configRepo.updateGuideMessageId).not.toHaveBeenCalled();
    });

    it('select 모드 config이면 안내 메시지를 전송한다', async () => {
      const config = makeConfig({
        mode: 'select',
        guideChannelId: 'guide-ch',
        guideMessage: '안내 메시지',
        guideMessageId: null,
        buttons: [],
      });
      configRepo.findById.mockResolvedValue(config);
      autoChannelDiscordGateway.sendGuideMessage.mockResolvedValue('msg-id');

      await service.sendOrUpdateGuideMessage(1);

      expect(autoChannelDiscordGateway.sendGuideMessage).toHaveBeenCalledOnce();
      expect(configRepo.updateGuideMessageId).toHaveBeenCalledWith(1, 'msg-id');
    });

    it('config가 없으면 안내 메시지를 전송하지 않는다', async () => {
      configRepo.findById.mockResolvedValue(null);

      await service.sendOrUpdateGuideMessage(999);

      expect(autoChannelDiscordGateway.sendGuideMessage).not.toHaveBeenCalled();
    });

    it('guideChannelId가 없으면 안내 메시지를 전송하지 않는다', async () => {
      const config = makeConfig({ mode: 'select', guideChannelId: null });
      configRepo.findById.mockResolvedValue(config);

      await service.sendOrUpdateGuideMessage(1);

      expect(autoChannelDiscordGateway.sendGuideMessage).not.toHaveBeenCalled();
    });

    it('기존 guideMessageId가 있으면 editGuideMessage를 먼저 시도한다', async () => {
      const config = makeConfig({
        mode: 'select',
        guideChannelId: 'guide-ch',
        guideMessage: '안내 메시지',
        guideMessageId: 'existing-msg-id',
        buttons: [],
      });
      configRepo.findById.mockResolvedValue(config);
      autoChannelDiscordGateway.editGuideMessage.mockResolvedValue('existing-msg-id');

      await service.sendOrUpdateGuideMessage(1);

      expect(autoChannelDiscordGateway.editGuideMessage).toHaveBeenCalledOnce();
      expect(autoChannelDiscordGateway.sendGuideMessage).not.toHaveBeenCalled();
    });

    it('editGuideMessage가 null 반환 시 sendGuideMessage로 폴백한다', async () => {
      const config = makeConfig({
        mode: 'select',
        guideChannelId: 'guide-ch',
        guideMessage: '안내 메시지',
        guideMessageId: 'old-msg-id',
        buttons: [],
      });
      configRepo.findById.mockResolvedValue(config);
      autoChannelDiscordGateway.editGuideMessage.mockResolvedValue(null);
      autoChannelDiscordGateway.sendGuideMessage.mockResolvedValue('new-msg-id');

      await service.sendOrUpdateGuideMessage(1);

      expect(autoChannelDiscordGateway.editGuideMessage).toHaveBeenCalledOnce();
      expect(autoChannelDiscordGateway.sendGuideMessage).toHaveBeenCalledOnce();
      expect(configRepo.updateGuideMessageId).toHaveBeenCalledWith(1, 'new-msg-id');
    });
  });

  // ────────────────────────────────────────────────────────────
  // cacheAutoChannelInfo — buttonId/buttonLabel 저장 (F-VOICE-032)
  // ────────────────────────────────────────────────────────────

  describe('cacheAutoChannelInfo — buttonId/buttonLabel 저장', () => {
    it('버튼 클릭으로 확정방 생성 시 buttonId와 buttonLabel이 setAutoChannelInfo에 전달된다', async () => {
      const button = makeButton({ id: 10, configId: 1, label: '오버워치' });
      button.config.id = 1;
      button.config.triggerChannelId = 'trigger-ch';
      (button.config as unknown as Record<string, unknown>).name = '게임방';
      configRepo.findButtonById.mockResolvedValue(button);
      discordVoiceGateway.createVoiceChannel.mockResolvedValue('confirmed-ch');

      await service.handleButtonClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        buttonId: 10,
        voiceChannelId: 'trigger-ch',
      });

      expect(voiceRedisRepository.setAutoChannelInfo).toHaveBeenCalledWith(
        'guild-1',
        'confirmed-ch',
        expect.objectContaining({
          configId: 1,
          channelType: 'auto_select',
          buttonId: 10,
          buttonLabel: '오버워치',
        }),
      );
    });

    it('instant 모드 확정방 생성 시 buttonId=null, buttonLabel=null이 setAutoChannelInfo에 전달된다', async () => {
      const config = makeConfig({
        id: 42,
        instantCategoryId: 'cat-instant',
        instantNameTemplate: '{username}의 방',
      });
      // makeConfig에 name이 없으므로 직접 할당
      (config as unknown as Record<string, unknown>).name = '즉시생성방';
      configRepo.findByTriggerChannel.mockResolvedValue(config);
      discordVoiceGateway.createVoiceChannel.mockResolvedValue('instant-ch');

      await service.handleInstantTriggerJoin({
        guildId: 'guild-1',
        userId: 'user-1',
        triggerChannelId: 'trigger-ch-1',
        displayName: 'Onyu',
      });

      expect(voiceRedisRepository.setAutoChannelInfo).toHaveBeenCalledWith(
        'guild-1',
        'instant-ch',
        expect.objectContaining({
          configId: 42,
          channelType: 'auto_instant',
          buttonId: null,
          buttonLabel: null,
        }),
      );
    });

    it('하위 선택지 클릭으로 확정방 생성 시 버튼의 buttonId와 buttonLabel이 전달된다', async () => {
      const button = makeButton({ id: 20, configId: 5, label: '팀데스매치' });
      button.config.id = 5;
      button.config.triggerChannelId = 'trigger-ch';
      (button.config as unknown as Record<string, unknown>).name = '게임방';
      const subOption = makeSubOption({ id: 30, button });
      configRepo.findSubOptionById.mockResolvedValue(subOption);
      discordVoiceGateway.createVoiceChannel.mockResolvedValue('sub-confirmed-ch');

      await service.handleSubOptionClickFromBot({
        guildId: 'guild-1',
        userId: 'user-1',
        displayName: 'Onyu',
        subOptionId: 30,
        voiceChannelId: 'trigger-ch',
      });

      expect(voiceRedisRepository.setAutoChannelInfo).toHaveBeenCalledWith(
        'guild-1',
        'sub-confirmed-ch',
        expect.objectContaining({
          configId: 5,
          channelType: 'auto_select',
          buttonId: 20,
          buttonLabel: '팀데스매치',
        }),
      );
    });
  });
});
