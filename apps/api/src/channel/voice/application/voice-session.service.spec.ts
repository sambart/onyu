import { type Mock } from 'vitest';

import { type VoiceSession } from '../infrastructure/voice-session.keys';
import { type VoiceStateDto } from '../infrastructure/voice-state.dto';
import { VoiceSessionService } from './voice-session.service';

function makeDto(
  overrides: Partial<{
    guildId: string;
    userId: string;
    channelId: string;
    userName: string;
    channelName: string;
    micOn: boolean;
    alone: boolean;
    streaming: boolean;
    videoOn: boolean;
    selfDeaf: boolean;
  }> = {},
): VoiceStateDto {
  return {
    guildId: overrides.guildId ?? 'guild-1',
    userId: overrides.userId ?? 'user-1',
    channelId: overrides.channelId ?? 'ch-1',
    userName: overrides.userName ?? 'Alice',
    channelName: overrides.channelName ?? 'General',
    parentCategoryId: null,
    categoryName: null,
    micOn: overrides.micOn ?? true,
    alone: overrides.alone ?? false,
    channelMemberCount: 1,
    avatarUrl: null,
    streaming: overrides.streaming ?? false,
    videoOn: overrides.videoOn ?? false,
    selfDeaf: overrides.selfDeaf ?? false,
  } as VoiceStateDto;
}

const SESSION_JOINED_AGO_MS = 60_000; // 60초 전
const SESSION_UPDATED_AGO_MS = 5_000; // 5초 전

function makeSession(overrides: Partial<VoiceSession> = {}): VoiceSession {
  return {
    channelId: 'ch-1',
    joinedAt: Date.now() - SESSION_JOINED_AGO_MS,
    mic: true,
    alone: false,
    lastUpdatedAt: Date.now() - SESSION_UPDATED_AGO_MS,
    date: '20260316', // today KST
    streaming: false,
    videoOn: false,
    selfDeaf: false,
    ...overrides,
  };
}

describe('VoiceSessionService.startOrUpdateSession', () => {
  let service: VoiceSessionService;
  let voiceRedisRepository: {
    setChannelName: Mock;
    setCategoryInfo: Mock;
    setUserName: Mock;
    getSession: Mock;
    setSession: Mock;
    accumulateDuration: Mock;
  };
  let voiceDailyFlushService: { flushDate: Mock };

  // KST 오늘 날짜를 mock하기 위해 실제 getKSTDateString을 사용하는 대신
  // 테스트에서는 session.date가 today와 같다고 가정한다

  beforeEach(() => {
    voiceRedisRepository = {
      setChannelName: vi.fn().mockResolvedValue(undefined),
      setCategoryInfo: vi.fn().mockResolvedValue(undefined),
      setUserName: vi.fn().mockResolvedValue(undefined),
      getSession: vi.fn(),
      setSession: vi.fn().mockResolvedValue(undefined),
      accumulateDuration: vi.fn().mockResolvedValue(undefined),
    };

    voiceDailyFlushService = {
      flushDate: vi.fn().mockResolvedValue(undefined),
    };

    // RedisService mock (직접 사용하지 않지만 DI 필요)
    const redisMock = {};

    service = new VoiceSessionService(
      voiceRedisRepository as never,
      voiceDailyFlushService as never,
      redisMock as never,
    );

    vi.clearAllMocks();
  });

  describe('세션이 없을 때 (신규 세션 생성)', () => {
    it('새 세션 생성 시 streaming 필드가 포함된다', async () => {
      voiceRedisRepository.getSession.mockResolvedValue(null);
      const dto = makeDto({ streaming: true });

      await service.startOrUpdateSession(dto);

      expect(voiceRedisRepository.setSession).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.objectContaining({ streaming: true }),
      );
    });

    it('새 세션 생성 시 videoOn 필드가 포함된다', async () => {
      voiceRedisRepository.getSession.mockResolvedValue(null);
      const dto = makeDto({ videoOn: true });

      await service.startOrUpdateSession(dto);

      expect(voiceRedisRepository.setSession).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.objectContaining({ videoOn: true }),
      );
    });

    it('새 세션 생성 시 selfDeaf 필드가 포함된다', async () => {
      voiceRedisRepository.getSession.mockResolvedValue(null);
      const dto = makeDto({ selfDeaf: true });

      await service.startOrUpdateSession(dto);

      expect(voiceRedisRepository.setSession).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.objectContaining({ selfDeaf: true }),
      );
    });

    it('새 세션 생성 시 streaming=false, videoOn=false, selfDeaf=false도 저장된다', async () => {
      voiceRedisRepository.getSession.mockResolvedValue(null);
      const dto = makeDto({ streaming: false, videoOn: false, selfDeaf: false });

      await service.startOrUpdateSession(dto);

      expect(voiceRedisRepository.setSession).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.objectContaining({
          streaming: false,
          videoOn: false,
          selfDeaf: false,
        }),
      );
    });
  });

  describe('세션이 있을 때 (기존 세션 업데이트)', () => {
    it('streaming이 변경되면 세션에 반영된다', async () => {
      // 기존 세션: streaming=false
      const existingSession = makeSession({ streaming: false });
      voiceRedisRepository.getSession.mockResolvedValue(existingSession);

      // 새 상태: streaming=true
      const dto = makeDto({ streaming: true });

      await service.startOrUpdateSession(dto);

      expect(voiceRedisRepository.setSession).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.objectContaining({ streaming: true }),
      );
    });

    it('videoOn이 변경되면 세션에 반영된다', async () => {
      const existingSession = makeSession({ videoOn: false });
      voiceRedisRepository.getSession.mockResolvedValue(existingSession);

      const dto = makeDto({ videoOn: true });

      await service.startOrUpdateSession(dto);

      expect(voiceRedisRepository.setSession).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.objectContaining({ videoOn: true }),
      );
    });

    it('selfDeaf가 변경되면 세션에 반영된다', async () => {
      const existingSession = makeSession({ selfDeaf: false });
      voiceRedisRepository.getSession.mockResolvedValue(existingSession);

      const dto = makeDto({ selfDeaf: true });

      await service.startOrUpdateSession(dto);

      expect(voiceRedisRepository.setSession).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.objectContaining({ selfDeaf: true }),
      );
    });

    it('업데이트 전에 accumulateDuration을 호출한다', async () => {
      const existingSession = makeSession();
      voiceRedisRepository.getSession.mockResolvedValue(existingSession);
      const dto = makeDto();

      await service.startOrUpdateSession(dto);

      expect(voiceRedisRepository.accumulateDuration).toHaveBeenCalled();
    });
  });

  describe('switchChannel', () => {
    it('새 채널 세션 생성 시 streaming/videoOn/selfDeaf가 newCmd 기준으로 설정된다', async () => {
      voiceRedisRepository.getSession.mockResolvedValue(null);
      const oldDto = makeDto({ channelId: 'ch-1' });
      const newDto = makeDto({ channelId: 'ch-2', streaming: true, videoOn: true, selfDeaf: true });

      await service.switchChannel(oldDto, newDto);

      expect(voiceRedisRepository.setSession).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.objectContaining({
          channelId: 'ch-2',
          streaming: true,
          videoOn: true,
          selfDeaf: true,
        }),
      );
    });

    it('기존 세션이 있을 때 채널 이동 후 새 세션에 streaming/videoOn/selfDeaf가 반영된다', async () => {
      const existingSession = makeSession({
        channelId: 'ch-1',
        streaming: false,
        videoOn: false,
        selfDeaf: false,
      });
      voiceRedisRepository.getSession.mockResolvedValue(existingSession);

      const oldDto = makeDto({ channelId: 'ch-1' });
      const newDto = makeDto({
        channelId: 'ch-2',
        streaming: true,
        videoOn: false,
        selfDeaf: false,
      });

      await service.switchChannel(oldDto, newDto);

      expect(voiceRedisRepository.setSession).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.objectContaining({
          channelId: 'ch-2',
          streaming: true,
        }),
      );
    });
  });
});
