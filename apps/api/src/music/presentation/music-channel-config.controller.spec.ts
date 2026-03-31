import type { Mock } from 'vitest';

import type { MusicChannelConfigSaveDto } from '../dto/music-channel-config.dto';
import type { MusicChannelConfigOrm } from '../infrastructure/music-channel-config.orm-entity';
import { MusicChannelConfigController } from './music-channel-config.controller';

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

function makeSaveDto(
  overrides: Partial<MusicChannelConfigSaveDto> = {},
): MusicChannelConfigSaveDto {
  return {
    channelId: 'ch-1',
    embedTitle: null,
    embedDescription: null,
    embedColor: null,
    embedThumbnailUrl: null,
    buttonConfig: DEFAULT_BUTTON_CONFIG,
    enabled: true,
    ...overrides,
  } as MusicChannelConfigSaveDto;
}

describe('MusicChannelConfigController', () => {
  let controller: MusicChannelConfigController;
  let configService: {
    getConfig: Mock;
    upsertConfig: Mock;
    resetConfig: Mock;
    deleteConfig: Mock;
  };

  beforeEach(() => {
    configService = {
      getConfig: vi.fn(),
      upsertConfig: vi.fn(),
      resetConfig: vi.fn(),
      deleteConfig: vi.fn(),
    };

    controller = new MusicChannelConfigController(configService as never);
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/guilds/:guildId/music/config
  // ─────────────────────────────────────────────────────────
  describe('getConfig', () => {
    it('guildId로 설정을 조회하여 반환한다', async () => {
      const config = makeConfigOrm();
      configService.getConfig.mockResolvedValue(config);

      const result = await controller.getConfig('guild-1');

      expect(configService.getConfig).toHaveBeenCalledWith('guild-1');
      expect(result).toBe(config);
    });

    it('설정이 없으면 null을 반환한다', async () => {
      configService.getConfig.mockResolvedValue(null);

      const result = await controller.getConfig('guild-1');

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────
  // PUT /api/guilds/:guildId/music/config
  // ─────────────────────────────────────────────────────────
  describe('upsertConfig', () => {
    it('guildId와 dto를 서비스에 전달하고 결과를 반환한다', async () => {
      const dto = makeSaveDto();
      const config = makeConfigOrm({ messageId: 'new-msg' });
      configService.upsertConfig.mockResolvedValue(config);

      const result = await controller.upsertConfig('guild-1', dto);

      expect(configService.upsertConfig).toHaveBeenCalledWith('guild-1', dto);
      expect(result).toBe(config);
    });

    it('서비스 에러 발생 시 에러를 그대로 throw한다', async () => {
      configService.upsertConfig.mockRejectedValue(new Error('Discord 전송 실패'));

      await expect(controller.upsertConfig('guild-1', makeSaveDto())).rejects.toThrow(
        'Discord 전송 실패',
      );
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/guilds/:guildId/music/config/reset
  // ─────────────────────────────────────────────────────────
  describe('resetConfig', () => {
    it('guildId로 설정을 초기화하고 결과를 반환한다', async () => {
      const config = makeConfigOrm();
      configService.resetConfig.mockResolvedValue(config);

      const result = await controller.resetConfig('guild-1');

      expect(configService.resetConfig).toHaveBeenCalledWith('guild-1');
      expect(result).toBe(config);
    });

    it('서비스 에러 발생 시 에러를 그대로 throw한다', async () => {
      configService.resetConfig.mockRejectedValue(new Error('Not Found'));

      await expect(controller.resetConfig('guild-1')).rejects.toThrow('Not Found');
    });
  });

  // ─────────────────────────────────────────────────────────
  // DELETE /api/guilds/:guildId/music/config
  // ─────────────────────────────────────────────────────────
  describe('deleteConfig', () => {
    it('guildId로 설정을 삭제하고 { ok: true }를 반환한다', async () => {
      configService.deleteConfig.mockResolvedValue(undefined);

      const result = await controller.deleteConfig('guild-1');

      expect(configService.deleteConfig).toHaveBeenCalledWith('guild-1');
      expect(result).toEqual({ ok: true });
    });

    it('서비스 에러 발생 시 에러를 그대로 throw한다', async () => {
      configService.deleteConfig.mockRejectedValue(new Error('DB 에러'));

      await expect(controller.deleteConfig('guild-1')).rejects.toThrow('DB 에러');
    });
  });
});
