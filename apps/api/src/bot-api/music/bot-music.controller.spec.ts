import type { Mock } from 'vitest';

import type { MusicChannelConfigOrm } from '../../music/infrastructure/music-channel-config.orm-entity';
import { BotMusicController } from './bot-music.controller';

const DEFAULT_BUTTON_CONFIG = {
  buttons: [{ type: 'search', label: '검색', emoji: '🔍', enabled: true, row: 0 }],
};

function makeConfigOrm(overrides: Partial<MusicChannelConfigOrm> = {}): MusicChannelConfigOrm {
  return {
    id: 1,
    guildId: 'guild-1',
    channelId: 'ch-1',
    messageId: null,
    embedTitle: null,
    embedDescription: null,
    embedColor: null,
    embedThumbnailUrl: null,
    buttonConfig: DEFAULT_BUTTON_CONFIG,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('BotMusicController', () => {
  let controller: BotMusicController;
  let configRepo: {
    findByGuildId: Mock;
    findByChannelId: Mock;
    updateMessageId: Mock;
  };

  beforeEach(() => {
    configRepo = {
      findByGuildId: vi.fn(),
      findByChannelId: vi.fn(),
      updateMessageId: vi.fn().mockResolvedValue(undefined),
    };

    controller = new BotMusicController(configRepo as never);
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────
  // GET /bot-api/music/channel-config
  // ─────────────────────────────────────────────────────────
  describe('getChannelConfig', () => {
    it('guildId로 설정을 조회하고 { ok: true, data } 형식으로 반환한다', async () => {
      const config = makeConfigOrm();
      configRepo.findByGuildId.mockResolvedValue(config);

      const result = await controller.getChannelConfig('guild-1');

      expect(configRepo.findByGuildId).toHaveBeenCalledWith('guild-1');
      expect(result).toEqual({ ok: true, data: config });
    });

    it('설정이 없으면 { ok: true, data: null }을 반환한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(null);

      const result = await controller.getChannelConfig('guild-unknown');

      expect(result).toEqual({ ok: true, data: null });
    });
  });

  // ─────────────────────────────────────────────────────────
  // GET /bot-api/music/channel-config/by-channel
  // ─────────────────────────────────────────────────────────
  describe('getByChannelId', () => {
    it('channelId로 설정을 조회하고 { ok: true, data } 형식으로 반환한다', async () => {
      const config = makeConfigOrm();
      configRepo.findByChannelId.mockResolvedValue(config);

      const result = await controller.getByChannelId('ch-1');

      expect(configRepo.findByChannelId).toHaveBeenCalledWith('ch-1');
      expect(result).toEqual({ ok: true, data: config });
    });

    it('채널 설정이 없으면 { ok: true, data: null }을 반환한다', async () => {
      configRepo.findByChannelId.mockResolvedValue(null);

      const result = await controller.getByChannelId('ch-unknown');

      expect(result).toEqual({ ok: true, data: null });
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /bot-api/music/channel-config/update-message-id
  // ─────────────────────────────────────────────────────────
  describe('updateMessageId', () => {
    it('guildId로 설정을 조회한 뒤 messageId를 갱신하고 { ok: true }를 반환한다', async () => {
      const config = makeConfigOrm({ id: 5 });
      configRepo.findByGuildId.mockResolvedValue(config);

      const result = await controller.updateMessageId({ guildId: 'guild-1', messageId: 'new-msg' });

      expect(configRepo.findByGuildId).toHaveBeenCalledWith('guild-1');
      expect(configRepo.updateMessageId).toHaveBeenCalledWith(5, 'new-msg');
      expect(result).toEqual({ ok: true });
    });

    it('설정이 없으면 updateMessageId를 호출하지 않고 { ok: true }를 반환한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(null);

      const result = await controller.updateMessageId({
        guildId: 'guild-unknown',
        messageId: 'msg',
      });

      expect(configRepo.updateMessageId).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });

    it('messageId를 null로 초기화할 수 있다', async () => {
      const config = makeConfigOrm({ id: 3, messageId: 'old-msg' });
      configRepo.findByGuildId.mockResolvedValue(config);

      await controller.updateMessageId({ guildId: 'guild-1', messageId: null });

      expect(configRepo.updateMessageId).toHaveBeenCalledWith(3, null);
    });
  });
});
