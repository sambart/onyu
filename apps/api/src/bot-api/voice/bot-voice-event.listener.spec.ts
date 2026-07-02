import { Logger } from '@nestjs/common';

import { KeyedSerializer } from '../../common/concurrency/keyed-serializer';
import { BotVoiceEventListener } from './bot-voice-event.listener';

/** 최소 VoiceStateUpdateEventDto 팩토리 */
function makeDto(
  overrides: Partial<{
    guildId: string;
    userId: string;
    eventType:
      | 'join'
      | 'leave'
      | 'move'
      | 'mic_toggle'
      | 'streaming_toggle'
      | 'video_toggle'
      | 'deaf_toggle';
    channelId: string | null;
    oldChannelId: string | null;
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
    userName: string;
  }> = {},
) {
  return {
    guildId: 'guild-1',
    userId: 'user-1',
    eventType: 'join' as const,
    channelId: 'ch-1',
    oldChannelId: null,
    channelName: '일반',
    oldChannelName: null,
    parentCategoryId: null,
    categoryName: null,
    oldParentCategoryId: null,
    oldCategoryName: null,
    micOn: true,
    avatarUrl: null,
    channelMemberCount: 1,
    oldChannelMemberCount: 0,
    channelMemberIds: ['user-1'],
    oldChannelMemberIds: [],
    userName: 'TestUser',
    ...overrides,
  };
}

describe('BotVoiceEventListener', () => {
  let listener: BotVoiceEventListener;
  let serializer: KeyedSerializer;

  // 의존성 mock
  const mockVoiceChannelService = {
    onUserJoined: vi.fn().mockResolvedValue(undefined),
    onUserLeave: vi.fn().mockResolvedValue(undefined),
    onUserMove: vi.fn().mockResolvedValue(undefined),
    onUserMicToggle: vi.fn().mockResolvedValue(undefined),
    onUserStreamingToggle: vi.fn().mockResolvedValue(undefined),
    onUserVideoToggle: vi.fn().mockResolvedValue(undefined),
    onUserDeafToggle: vi.fn().mockResolvedValue(undefined),
  };
  const mockVoiceSessionService = {
    updateAloneForChannel: vi.fn().mockResolvedValue(undefined),
  };
  const mockExcludedChannelService = {
    isExcludedChannel: vi.fn().mockResolvedValue(false),
  };
  const mockStatusPrefixResetService = {
    restoreOnLeave: vi.fn().mockResolvedValue(undefined),
  };
  const mockAutoChannelService = {
    handleInstantTriggerJoin: vi.fn().mockResolvedValue(undefined),
    clearPendingDelete: vi.fn().mockResolvedValue(undefined),
    handleChannelEmpty: vi.fn().mockResolvedValue(undefined),
  };
  const mockAutoChannelConfigRepo = {
    findByTriggerChannel: vi.fn().mockResolvedValue(null),
  };
  const mockVoiceGameService = {
    onUserJoined: vi.fn().mockResolvedValue(undefined),
    onUserLeft: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Logger 를 mock 처리 (콘솔 노이즈 제거)
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    serializer = new KeyedSerializer();

    listener = new BotVoiceEventListener(
      mockVoiceChannelService as never,
      mockVoiceSessionService as never,
      mockExcludedChannelService as never,
      mockStatusPrefixResetService as never,
      mockAutoChannelService as never,
      mockAutoChannelConfigRepo as never,
      mockVoiceGameService as never,
      serializer,
    );
  });

  // ──────────────────────────────────────────────
  // A. serializer.runExclusive 호출 키 검증
  // ──────────────────────────────────────────────
  describe('runExclusive 키 형식 검증', () => {
    it('handle() 호출 시 "${guildId}:${userId}" 형식으로 runExclusive 가 호출된다', async () => {
      const runExclusiveSpy = vi.spyOn(serializer, 'runExclusive');

      const dto = makeDto({ guildId: 'guild-X', userId: 'user-Y' });
      await listener.handle(dto);

      expect(runExclusiveSpy).toHaveBeenCalledOnce();
      expect(runExclusiveSpy).toHaveBeenCalledWith('guild-X:user-Y', expect.any(Function));
    });

    it('guildId 와 userId 가 다를 때 올바른 복합 키를 사용한다', async () => {
      const runExclusiveSpy = vi.spyOn(serializer, 'runExclusive');

      await listener.handle(makeDto({ guildId: 'g1', userId: 'u1' }));
      await listener.handle(makeDto({ guildId: 'g2', userId: 'u2' }));

      const calls = runExclusiveSpy.mock.calls;
      expect(calls[0][0]).toBe('g1:u1');
      expect(calls[1][0]).toBe('g2:u2');
    });
  });

  // ──────────────────────────────────────────────
  // B. eventType 라우팅 검증
  // ──────────────────────────────────────────────
  describe('eventType 라우팅', () => {
    it('join 이벤트 → voiceChannelService.onUserJoined 가 호출된다', async () => {
      await listener.handle(makeDto({ eventType: 'join', channelId: 'ch-1' }));
      expect(mockVoiceChannelService.onUserJoined).toHaveBeenCalledOnce();
    });

    it('leave 이벤트 → voiceChannelService.onUserLeave 가 호출된다', async () => {
      await listener.handle(
        makeDto({ eventType: 'leave', channelId: null, oldChannelId: 'ch-old' }),
      );
      expect(mockVoiceChannelService.onUserLeave).toHaveBeenCalledOnce();
    });

    it('mic_toggle 이벤트 → voiceChannelService.onUserMicToggle 이 호출된다', async () => {
      await listener.handle(makeDto({ eventType: 'mic_toggle', channelId: 'ch-1' }));
      expect(mockVoiceChannelService.onUserMicToggle).toHaveBeenCalledOnce();
    });

    it('streaming_toggle 이벤트 → voiceChannelService.onUserStreamingToggle 이 호출된다', async () => {
      await listener.handle(makeDto({ eventType: 'streaming_toggle', channelId: 'ch-1' }));
      expect(mockVoiceChannelService.onUserStreamingToggle).toHaveBeenCalledOnce();
    });

    it('video_toggle 이벤트 → voiceChannelService.onUserVideoToggle 이 호출된다', async () => {
      await listener.handle(makeDto({ eventType: 'video_toggle', channelId: 'ch-1' }));
      expect(mockVoiceChannelService.onUserVideoToggle).toHaveBeenCalledOnce();
    });

    it('deaf_toggle 이벤트 → voiceChannelService.onUserDeafToggle 이 호출된다', async () => {
      await listener.handle(makeDto({ eventType: 'deaf_toggle', channelId: 'ch-1' }));
      expect(mockVoiceChannelService.onUserDeafToggle).toHaveBeenCalledOnce();
    });
  });

  // ──────────────────────────────────────────────
  // C. 실제 serializer 인스턴스로 같은 유저 이벤트 직렬 처리
  // ──────────────────────────────────────────────
  describe('같은 유저 이벤트 직렬 처리', () => {
    it('같은 유저의 이벤트 2개가 순서대로(직렬) 처리된다', async () => {
      // 직렬 검증 전략: 두 handle() 를 순서 보장 상태로 모두 완료시킨 후,
      // 서비스 메서드 호출 순서가 join → mic_toggle 임을 단언한다.
      const callOrder: string[] = [];

      mockVoiceChannelService.onUserJoined.mockImplementationOnce(async () => {
        callOrder.push('join');
      });
      mockVoiceChannelService.onUserMicToggle.mockImplementationOnce(async () => {
        callOrder.push('mic_toggle');
      });

      // 같은 유저 → 직렬화 큐 → join 완전히 끝난 후 mic_toggle 실행
      const pJoin = listener.handle(
        makeDto({ guildId: 'g', userId: 'u', eventType: 'join', channelId: 'ch' }),
      );
      const pMicToggle = listener.handle(
        makeDto({ guildId: 'g', userId: 'u', eventType: 'mic_toggle', channelId: 'ch' }),
      );

      await Promise.all([pJoin, pMicToggle]);

      // 직렬화 덕분에 join 이 먼저 처리됨
      expect(callOrder).toEqual(['join', 'mic_toggle']);
    });

    it('같은 유저 이벤트가 직렬화 중일 때 다른 유저 이벤트는 독립적으로 처리된다', async () => {
      // 검증: 다른 userId 는 독립 큐 → 순서 보장 없음 (어떤 순서든 모두 처리됨)
      const processed: string[] = [];

      mockVoiceChannelService.onUserJoined
        .mockImplementationOnce(async () => {
          processed.push('A');
        })
        .mockImplementationOnce(async () => {
          processed.push('B');
        });

      const pA = listener.handle(
        makeDto({ guildId: 'g', userId: 'user-A', eventType: 'join', channelId: 'ch' }),
      );
      const pB = listener.handle(
        makeDto({ guildId: 'g', userId: 'user-B', eventType: 'join', channelId: 'ch' }),
      );

      await Promise.all([pA, pB]);

      // 두 유저 모두 처리됨 (다른 key → 독립 실행)
      expect(processed).toContain('A');
      expect(processed).toContain('B');
    });
  });

  // ──────────────────────────────────────────────
  // D. 내부 에러 처리 (try-catch catch 블록)
  // ──────────────────────────────────────────────
  describe('내부 에러 처리', () => {
    it('내부 서비스 에러가 발생해도 handle() 은 reject 하지 않는다', async () => {
      mockVoiceChannelService.onUserJoined.mockRejectedValueOnce(new Error('service-error'));

      // handle 자체는 try-catch 로 감싸져 있으므로 reject 하면 안 됨
      await expect(
        listener.handle(makeDto({ eventType: 'join', channelId: 'ch' })),
      ).resolves.toBeUndefined();
    });

    it('에러 발생 후에도 같은 유저의 다음 이벤트가 처리된다', async () => {
      mockVoiceChannelService.onUserJoined.mockRejectedValueOnce(new Error('join-fail'));
      mockVoiceChannelService.onUserMicToggle.mockResolvedValueOnce(undefined);

      await listener.handle(
        makeDto({ guildId: 'g', userId: 'u', eventType: 'join', channelId: 'ch' }),
      );
      await listener.handle(
        makeDto({ guildId: 'g', userId: 'u', eventType: 'mic_toggle', channelId: 'ch' }),
      );

      expect(mockVoiceChannelService.onUserMicToggle).toHaveBeenCalledOnce();
    });
  });
});
