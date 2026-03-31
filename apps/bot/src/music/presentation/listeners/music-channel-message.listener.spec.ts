import type { Mock } from 'vitest';

vi.mock('@onyu/bot-api-client', () => ({
  BotApiClientService: class {},
  BotApiClientModule: class {},
}));

import type { MusicChannelConfigResponse } from '@onyu/bot-api-client';

import { MusicChannelMessageListener } from './music-channel-message.listener';

function makeConfig(
  overrides: Partial<MusicChannelConfigResponse> = {},
): MusicChannelConfigResponse {
  return {
    id: 1,
    guildId: 'guild-1',
    channelId: 'ch-1',
    messageId: 'msg-1',
    embedTitle: null,
    embedDescription: null,
    embedColor: null,
    embedThumbnailUrl: null,
    buttonConfig: { buttons: [] },
    enabled: true,
    ...overrides,
  };
}

function makeMessage(
  overrides: {
    isBot?: boolean;
    guildId?: string | null;
    channelId?: string;
    content?: string;
    userId?: string;
    voiceChannelId?: string | null;
  } = {},
) {
  const voiceChannelId =
    overrides.voiceChannelId !== undefined ? overrides.voiceChannelId : 'voice-1';
  const member = {
    voice: { channelId: voiceChannelId },
  };

  return {
    author: {
      bot: overrides.isBot ?? false,
      id: overrides.userId ?? 'user-1',
    },
    guildId: overrides.guildId !== undefined ? overrides.guildId : 'guild-1',
    channelId: overrides.channelId ?? 'ch-1',
    content: overrides.content ?? '재생할 곡',
    member,
    reply: vi.fn().mockResolvedValue({
      delete: vi.fn().mockResolvedValue(undefined),
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe('MusicChannelMessageListener', () => {
  let listener: MusicChannelMessageListener;
  let musicService: {
    play: Mock;
  };
  let botApiClient: {
    getMusicChannelConfigByChannel: Mock;
  };

  beforeEach(() => {
    musicService = {
      play: vi
        .fn()
        .mockResolvedValue({ firstTrack: { title: '트랙' }, isPlaylist: false, trackCount: 1 }),
    };

    botApiClient = {
      getMusicChannelConfigByChannel: vi.fn(),
    };

    listener = new MusicChannelMessageListener(musicService as never, botApiClient as never);
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────
  // 기본 필터링
  // ─────────────────────────────────────────────────────────
  describe('handleMessage — 기본 필터링', () => {
    it('봇 메시지는 무시한다', async () => {
      const message = makeMessage({ isBot: true });
      await listener.handleMessage(message as never);
      expect(botApiClient.getMusicChannelConfigByChannel).not.toHaveBeenCalled();
    });

    it('guildId가 없는 메시지는 무시한다', async () => {
      const message = makeMessage({ guildId: null });
      await listener.handleMessage(message as never);
      expect(botApiClient.getMusicChannelConfigByChannel).not.toHaveBeenCalled();
    });

    it('음악 채널 설정이 없으면 처리하지 않는다', async () => {
      botApiClient.getMusicChannelConfigByChannel.mockResolvedValue(null);
      const message = makeMessage();
      await listener.handleMessage(message as never);
      expect(musicService.play).not.toHaveBeenCalled();
    });

    it('enabled=false인 채널 설정이면 처리하지 않는다', async () => {
      botApiClient.getMusicChannelConfigByChannel.mockResolvedValue(makeConfig({ enabled: false }));
      const message = makeMessage();
      await listener.handleMessage(message as never);
      expect(musicService.play).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────
  // 음성 채널 검증
  // ─────────────────────────────────────────────────────────
  describe('음성 채널 검증', () => {
    it('음성 채널 미접속 시 안내 메시지를 reply하고 원본 메시지를 삭제한다', async () => {
      botApiClient.getMusicChannelConfigByChannel.mockResolvedValue(makeConfig({ enabled: true }));
      const message = makeMessage({ voiceChannelId: null });

      await listener.handleMessage(message as never);

      expect(message.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '음성 채널에 먼저 입장해 주세요.' }),
      );
      expect(message.delete).toHaveBeenCalled();
      expect(musicService.play).not.toHaveBeenCalled();
    });

    it('음성 채널 미접속 시 play()를 호출하지 않는다', async () => {
      botApiClient.getMusicChannelConfigByChannel.mockResolvedValue(makeConfig({ enabled: true }));
      const message = makeMessage({ voiceChannelId: null });

      await listener.handleMessage(message as never);

      expect(musicService.play).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────
  // 정상 처리
  // ─────────────────────────────────────────────────────────
  describe('정상 처리', () => {
    it('메시지 내용을 검색어로 음악을 재생한다', async () => {
      botApiClient.getMusicChannelConfigByChannel.mockResolvedValue(makeConfig({ enabled: true }));
      const message = makeMessage({ content: '봄날 BTS', voiceChannelId: 'voice-1' });

      await listener.handleMessage(message as never);

      expect(musicService.play).toHaveBeenCalledWith(
        expect.objectContaining({
          query: '봄날 BTS',
          guildId: 'guild-1',
          voiceChannelId: 'voice-1',
          requesterId: 'user-1',
        }),
      );
    });

    it('처리 완료 후 원본 메시지를 삭제한다', async () => {
      botApiClient.getMusicChannelConfigByChannel.mockResolvedValue(makeConfig({ enabled: true }));
      const message = makeMessage();

      await listener.handleMessage(message as never);

      expect(message.delete).toHaveBeenCalled();
    });

    it('play() 실패 시에도 원본 메시지를 삭제한다 (finally)', async () => {
      botApiClient.getMusicChannelConfigByChannel.mockResolvedValue(makeConfig({ enabled: true }));
      musicService.play.mockRejectedValue(new Error('Kazagumo error'));
      const message = makeMessage();

      await listener.handleMessage(message as never);

      expect(message.delete).toHaveBeenCalled();
    });

    it('봇이 아닌 사용자의 메시지만 처리한다', async () => {
      botApiClient.getMusicChannelConfigByChannel.mockResolvedValue(makeConfig({ enabled: true }));
      const message = makeMessage({ isBot: false, content: '테스트 곡' });

      await listener.handleMessage(message as never);

      expect(musicService.play).toHaveBeenCalled();
    });
  });
});
