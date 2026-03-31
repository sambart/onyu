import type { Mock } from 'vitest';

// @onyu/bot-api-client 모듈은 @nestjs/axios를 로드하므로
// 컨테이너 환경에서 vi.mock으로 로드를 차단하고 타입만 사용한다
vi.mock('@onyu/bot-api-client', () => ({
  BotApiClientService: class {},
  BotApiClientModule: class {},
}));

import type { MusicChannelConfigResponse } from '@onyu/bot-api-client';

import { MusicChannelService } from './music-channel.service';

function makeConfig(
  overrides: Partial<MusicChannelConfigResponse> = {},
): MusicChannelConfigResponse {
  return {
    id: 1,
    guildId: 'guild-1',
    channelId: 'ch-1',
    messageId: 'msg-1',
    embedTitle: '음악 채널',
    embedDescription: '버튼을 눌러 음악을 재생하거나, 검색어를 입력하세요.',
    embedColor: '#5865F2',
    embedThumbnailUrl: null,
    buttonConfig: {
      buttons: [
        { type: 'search', label: '검색', emoji: '🔍', enabled: true, row: 0 },
        { type: 'skip', label: '스킵', emoji: '⏭️', enabled: true, row: 1 },
      ],
    },
    enabled: true,
    ...overrides,
  };
}

function makeTrack(
  overrides: {
    title?: string;
    uri?: string | null;
    author?: string | null;
    length?: number;
    thumbnail?: string | null;
  } = {},
) {
  return {
    title: overrides.title ?? '테스트 트랙',
    uri: overrides.uri !== undefined ? overrides.uri : 'https://example.com/track',
    author: overrides.author ?? '테스트 아티스트',
    length: overrides.length ?? 180_000,
    thumbnail: overrides.thumbnail !== undefined ? overrides.thumbnail : null,
  };
}

function makePlayer(overrides: { position?: number; paused?: boolean } = {}) {
  return {
    position: overrides.position ?? 0,
    paused: overrides.paused ?? false,
  };
}

describe('MusicChannelService', () => {
  let service: MusicChannelService;
  let mockClient: {
    channels: {
      fetch: Mock;
    };
  };
  let mockBotApiClient: {
    getMusicChannelConfig: Mock;
    updateMusicChannelMessageId: Mock;
  };

  // Discord TextChannel mock
  function makeChannel(isTextBased = true) {
    const mockMessage = {
      edit: vi.fn().mockResolvedValue(undefined),
    };
    const mockMessages = {
      fetch: vi.fn().mockResolvedValue(mockMessage),
    };
    return {
      isTextBased: vi.fn().mockReturnValue(isTextBased),
      messages: mockMessages,
      _message: mockMessage,
    };
  }

  beforeEach(() => {
    mockClient = {
      channels: {
        fetch: vi.fn(),
      },
    };

    mockBotApiClient = {
      getMusicChannelConfig: vi.fn(),
      updateMusicChannelMessageId: vi.fn().mockResolvedValue(undefined),
    };

    service = new MusicChannelService(mockClient as never, mockBotApiClient as never);
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────
  // updatePlayingEmbed
  // ─────────────────────────────────────────────────────────
  describe('updatePlayingEmbed', () => {
    it('enabled=true이고 messageId가 있으면 재생 중 임베드로 채널 메시지를 수정한다', async () => {
      const config = makeConfig({ enabled: true, messageId: 'msg-1' });
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(config);
      const channel = makeChannel(true);
      mockClient.channels.fetch.mockResolvedValue(channel);

      const track = makeTrack();
      const player = makePlayer();

      await service.updatePlayingEmbed('guild-1', track as never, player as never);

      expect(mockBotApiClient.getMusicChannelConfig).toHaveBeenCalledWith('guild-1');
      expect(mockClient.channels.fetch).toHaveBeenCalledWith('ch-1');
      expect(channel.messages.fetch).toHaveBeenCalledWith('msg-1');
      expect(channel._message.edit).toHaveBeenCalled();
    });

    it('config가 null이면 임베드를 갱신하지 않는다', async () => {
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(null);

      await service.updatePlayingEmbed('guild-1', makeTrack() as never, makePlayer() as never);

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });

    it('enabled=false이면 임베드를 갱신하지 않는다', async () => {
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(makeConfig({ enabled: false }));

      await service.updatePlayingEmbed('guild-1', makeTrack() as never, makePlayer() as never);

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });

    it('messageId가 없으면 임베드를 갱신하지 않는다', async () => {
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(makeConfig({ messageId: null }));

      await service.updatePlayingEmbed('guild-1', makeTrack() as never, makePlayer() as never);

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });

    it('메시지 수정 실패 시 messageId를 null로 초기화한다', async () => {
      const config = makeConfig({ enabled: true, messageId: 'msg-1' });
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(config);
      mockClient.channels.fetch.mockRejectedValue(new Error('Channel not found'));

      await service.updatePlayingEmbed('guild-1', makeTrack() as never, makePlayer() as never);

      expect(mockBotApiClient.updateMusicChannelMessageId).toHaveBeenCalledWith('guild-1', null);
    });

    it('채널이 텍스트 기반이 아니면 메시지를 수정하지 않는다', async () => {
      const config = makeConfig({ enabled: true, messageId: 'msg-1' });
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(config);
      const nonTextChannel = { isTextBased: vi.fn().mockReturnValue(false) };
      mockClient.channels.fetch.mockResolvedValue(nonTextChannel);

      await service.updatePlayingEmbed('guild-1', makeTrack() as never, makePlayer() as never);

      // edit 호출 없음 (messages 속성 없음)
      expect(mockBotApiClient.updateMusicChannelMessageId).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────
  // restoreIdleEmbed
  // ─────────────────────────────────────────────────────────
  describe('restoreIdleEmbed', () => {
    it('enabled=true이고 messageId가 있으면 대기 상태 임베드로 채널 메시지를 수정한다', async () => {
      const config = makeConfig({ enabled: true, messageId: 'msg-1' });
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(config);
      const channel = makeChannel(true);
      mockClient.channels.fetch.mockResolvedValue(channel);

      await service.restoreIdleEmbed('guild-1');

      expect(mockClient.channels.fetch).toHaveBeenCalledWith('ch-1');
      expect(channel._message.edit).toHaveBeenCalled();
    });

    it('config가 null이면 임베드를 복원하지 않는다', async () => {
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(null);

      await service.restoreIdleEmbed('guild-1');

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });

    it('enabled=false이면 임베드를 복원하지 않는다', async () => {
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(makeConfig({ enabled: false }));

      await service.restoreIdleEmbed('guild-1');

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });

    it('messageId가 없으면 임베드를 복원하지 않는다', async () => {
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(makeConfig({ messageId: null }));

      await service.restoreIdleEmbed('guild-1');

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });

    it('메시지 수정 실패 시 messageId를 null로 초기화한다', async () => {
      const config = makeConfig({ enabled: true, messageId: 'msg-1' });
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(config);
      mockClient.channels.fetch.mockRejectedValue(new Error('Message deleted'));

      await service.restoreIdleEmbed('guild-1');

      expect(mockBotApiClient.updateMusicChannelMessageId).toHaveBeenCalledWith('guild-1', null);
    });
  });

  // ─────────────────────────────────────────────────────────
  // updatePauseState
  // ─────────────────────────────────────────────────────────
  describe('updatePauseState', () => {
    it('enabled=true이고 messageId가 있으면 일시정지 상태 임베드로 채널 메시지를 수정한다', async () => {
      const config = makeConfig({ enabled: true, messageId: 'msg-1' });
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(config);
      const channel = makeChannel(true);
      mockClient.channels.fetch.mockResolvedValue(channel);

      const track = makeTrack();
      await service.updatePauseState('guild-1', true, track as never);

      expect(mockBotApiClient.getMusicChannelConfig).toHaveBeenCalledWith('guild-1');
      expect(mockClient.channels.fetch).toHaveBeenCalledWith('ch-1');
      expect(channel.messages.fetch).toHaveBeenCalledWith('msg-1');
      expect(channel._message.edit).toHaveBeenCalled();
    });

    it('config가 null이면 임베드를 갱신하지 않는다', async () => {
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(null);

      await service.updatePauseState('guild-1', true, makeTrack() as never);

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });

    it('enabled=false이면 임베드를 갱신하지 않는다', async () => {
      mockBotApiClient.getMusicChannelConfig.mockResolvedValue(makeConfig({ enabled: false }));

      await service.updatePauseState('guild-1', false, makeTrack() as never);

      expect(mockClient.channels.fetch).not.toHaveBeenCalled();
    });
  });
});
