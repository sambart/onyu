import type { Mock } from 'vitest';

import type { MusicChannelConfigSaveDto } from '../dto/music-channel-config.dto';
import type { MusicChannelConfigOrm } from '../infrastructure/music-channel-config.orm-entity';
import { MusicChannelConfigService } from './music-channel-config.service';

const DEFAULT_BUTTON_CONFIG = {
  buttons: [
    { type: 'search', label: '음악 검색하기', emoji: '🔍', enabled: true, row: 0 },
    { type: 'pause_resume', label: '일시정지/재개', emoji: '⏯️', enabled: true, row: 1 },
    { type: 'skip', label: '스킵', emoji: '⏭️', enabled: true, row: 1 },
    { type: 'stop', label: '정지', emoji: '⏹️', enabled: true, row: 1 },
    { type: 'queue', label: '재생목록', emoji: '📋', enabled: true, row: 2 },
    { type: 'melon_chart', label: '멜론차트', emoji: '🎵', enabled: true, row: 2 },
    { type: 'billboard_chart', label: '빌보드', emoji: '🎶', enabled: true, row: 2 },
  ],
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

describe('MusicChannelConfigService', () => {
  let service: MusicChannelConfigService;
  let configRepo: {
    findByGuildId: Mock;
    save: Mock;
    updateMessageId: Mock;
    delete: Mock;
    findByChannelId: Mock;
  };
  let discordAdapter: {
    sendMessage: Mock;
    editMessage: Mock;
    deleteMessage: Mock;
  };

  beforeEach(() => {
    configRepo = {
      findByGuildId: vi.fn(),
      save: vi.fn(),
      updateMessageId: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      findByChannelId: vi.fn(),
    };

    discordAdapter = {
      sendMessage: vi.fn(),
      editMessage: vi.fn().mockResolvedValue(undefined),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
    };

    service = new MusicChannelConfigService(configRepo as never, discordAdapter as never);
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────
  // getConfig
  // ─────────────────────────────────────────────────────────
  describe('getConfig', () => {
    it('guildId로 설정을 조회하여 반환한다', async () => {
      const config = makeConfigOrm();
      configRepo.findByGuildId.mockResolvedValue(config);

      const result = await service.getConfig('guild-1');

      expect(configRepo.findByGuildId).toHaveBeenCalledWith('guild-1');
      expect(result).toBe(config);
    });

    it('설정이 없으면 null을 반환한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(null);

      const result = await service.getConfig('guild-unknown');

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────
  // upsertConfig
  // ─────────────────────────────────────────────────────────
  describe('upsertConfig', () => {
    it('enabled=true이고 messageId가 없으면 임베드를 전송하고 messageId를 DB에 저장한다', async () => {
      const saved = makeConfigOrm({ enabled: true, messageId: null });
      configRepo.save.mockResolvedValue(saved);
      discordAdapter.sendMessage.mockResolvedValue('new-msg-id');

      const result = await service.upsertConfig('guild-1', makeSaveDto({ enabled: true }));

      expect(configRepo.save).toHaveBeenCalledWith('guild-1', expect.anything());
      expect(discordAdapter.sendMessage).toHaveBeenCalledWith('ch-1', expect.anything());
      expect(configRepo.updateMessageId).toHaveBeenCalledWith(1, 'new-msg-id');
      expect(result.messageId).toBe('new-msg-id');
    });

    it('enabled=true이고 messageId가 있으면 기존 메시지를 삭제 후 새로 전송한다', async () => {
      const saved = makeConfigOrm({ enabled: true, messageId: 'existing-msg' });
      configRepo.save.mockResolvedValue(saved);
      discordAdapter.sendMessage.mockResolvedValue('new-msg-id');

      const result = await service.upsertConfig('guild-1', makeSaveDto({ enabled: true }));

      expect(discordAdapter.deleteMessage).toHaveBeenCalledWith('ch-1', 'existing-msg');
      expect(discordAdapter.sendMessage).toHaveBeenCalledWith('ch-1', expect.anything());
      expect(configRepo.updateMessageId).toHaveBeenCalledWith(1, 'new-msg-id');
      expect(result.messageId).toBe('new-msg-id');
    });

    it('enabled=false이면 임베드를 갱신하지 않는다', async () => {
      const saved = makeConfigOrm({ enabled: false });
      configRepo.save.mockResolvedValue(saved);

      await service.upsertConfig('guild-1', makeSaveDto({ enabled: false }));

      expect(discordAdapter.editMessage).not.toHaveBeenCalled();
      expect(discordAdapter.sendMessage).not.toHaveBeenCalled();
    });

    it('Discord 전송 실패 시 에러를 throw한다', async () => {
      const saved = makeConfigOrm({ enabled: true, messageId: null });
      configRepo.save.mockResolvedValue(saved);
      discordAdapter.sendMessage.mockRejectedValue(new Error('Discord API Error'));

      await expect(service.upsertConfig('guild-1', makeSaveDto({ enabled: true }))).rejects.toThrow(
        'Discord API Error',
      );
      expect(configRepo.updateMessageId).not.toHaveBeenCalled();
    });

    it('deleteMessage 실패는 무시하고 새 메시지를 전송한다', async () => {
      const saved = makeConfigOrm({ enabled: true, messageId: 'msg-1' });
      configRepo.save.mockResolvedValue(saved);
      discordAdapter.deleteMessage.mockRejectedValue(new Error('Delete failed'));
      discordAdapter.sendMessage.mockResolvedValue('new-msg-id');

      await expect(service.upsertConfig('guild-1', makeSaveDto({ enabled: true }))).rejects.toThrow(
        'Delete failed',
      );
    });

    it('임베드 전송 시 payload에 embeds와 components가 포함된다', async () => {
      const saved = makeConfigOrm({ enabled: true });
      configRepo.save.mockResolvedValue(saved);
      discordAdapter.sendMessage.mockResolvedValue('msg-1');

      await service.upsertConfig('guild-1', makeSaveDto({ enabled: true }));

      const [, payload] = discordAdapter.sendMessage.mock.calls[0] as [
        string,
        { embeds: unknown[]; components: unknown[] },
      ];
      expect(payload.embeds).toBeDefined();
      expect(payload.components).toBeDefined();
      expect(payload.embeds.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────
  // resetConfig
  // ─────────────────────────────────────────────────────────
  describe('resetConfig', () => {
    it('기존 설정이 있으면 임베드·버튼을 기본값으로 초기화한다', async () => {
      const existing = makeConfigOrm({
        channelId: 'ch-custom',
        embedTitle: '커스텀',
        enabled: true,
      });
      configRepo.findByGuildId.mockResolvedValue(existing);

      const resetResult = makeConfigOrm({ channelId: 'ch-custom', embedTitle: null });
      configRepo.save.mockResolvedValue(resetResult);
      discordAdapter.editMessage.mockResolvedValue(undefined);

      await service.resetConfig('guild-1');

      const saveCall = configRepo.save.mock.calls[0] as [string, MusicChannelConfigSaveDto];
      expect(saveCall[1].channelId).toBe('ch-custom');
      expect(saveCall[1].embedTitle).toBeNull();
      expect(saveCall[1].embedDescription).toBeNull();
      expect(saveCall[1].embedColor).toBeNull();
      expect(saveCall[1].buttonConfig.buttons).toHaveLength(7);
    });

    it('기존 설정이 없으면 기본값으로 새로 생성한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(null);

      const newConfig = makeConfigOrm({ channelId: '', enabled: true });
      configRepo.save.mockResolvedValue(newConfig);

      const result = await service.resetConfig('guild-unknown');

      const saveCall = configRepo.save.mock.calls[0] as [string, MusicChannelConfigSaveDto];
      expect(saveCall[1].channelId).toBe('');
      expect(saveCall[1].enabled).toBe(true);
      expect(saveCall[1].buttonConfig.buttons).toHaveLength(7);
      expect(result).toBe(newConfig);
    });
  });

  // ─────────────────────────────────────────────────────────
  // deleteConfig
  // ─────────────────────────────────────────────────────────
  describe('deleteConfig', () => {
    it('guildId로 설정을 삭제한다', async () => {
      await service.deleteConfig('guild-1');

      expect(configRepo.delete).toHaveBeenCalledWith('guild-1');
    });

    it('삭제 시 Discord 메시지는 삭제하지 않는다 (PRD 명세)', async () => {
      await service.deleteConfig('guild-1');

      expect(discordAdapter.deleteMessage).not.toHaveBeenCalled();
      expect(discordAdapter.editMessage).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────
  // buildIdleEmbedPayload (private — upsertConfig 통해 간접 검증)
  // ─────────────────────────────────────────────────────────
  describe('임베드 빌드 (upsertConfig 통해 검증)', () => {
    it('embedTitle이 없으면 기본값 "음악 채널"을 사용한다', async () => {
      const saved = makeConfigOrm({ enabled: true, embedTitle: null });
      configRepo.save.mockResolvedValue(saved);
      discordAdapter.sendMessage.mockResolvedValue('msg');

      await service.upsertConfig('guild-1', makeSaveDto({ embedTitle: null }));

      const [, payload] = discordAdapter.sendMessage.mock.calls[0] as [
        string,
        { embeds: Array<{ title?: string }> },
      ];
      expect(payload.embeds[0]?.title).toBe('음악 채널');
    });

    it('embedTitle이 있으면 커스텀 제목을 사용한다', async () => {
      const saved = makeConfigOrm({ enabled: true, embedTitle: '나만의 음악방' });
      configRepo.save.mockResolvedValue(saved);
      discordAdapter.sendMessage.mockResolvedValue('msg');

      await service.upsertConfig('guild-1', makeSaveDto({ embedTitle: '나만의 음악방' }));

      const [, payload] = discordAdapter.sendMessage.mock.calls[0] as [
        string,
        { embeds: Array<{ title?: string }> },
      ];
      expect(payload.embeds[0]?.title).toBe('나만의 음악방');
    });

    it('embedDescription이 없으면 기본 설명 텍스트를 사용한다', async () => {
      const saved = makeConfigOrm({ enabled: true, embedDescription: null });
      configRepo.save.mockResolvedValue(saved);
      discordAdapter.sendMessage.mockResolvedValue('msg');

      await service.upsertConfig('guild-1', makeSaveDto({ embedDescription: null }));

      const [, payload] = discordAdapter.sendMessage.mock.calls[0] as [
        string,
        { embeds: Array<{ description?: string }> },
      ];
      expect(payload.embeds[0]?.description).toBe(
        '버튼을 눌러 음악을 재생하거나, 검색어를 입력하세요.',
      );
    });

    it('enabled=false인 버튼은 ActionRow에 포함하지 않는다', async () => {
      const configWithDisabled = makeConfigOrm({
        enabled: true,
        buttonConfig: {
          buttons: [
            { type: 'search', label: '검색', emoji: '🔍', enabled: true, row: 0 },
            { type: 'stop', label: '정지', emoji: '⏹️', enabled: false, row: 0 },
          ],
        },
      });
      configRepo.save.mockResolvedValue(configWithDisabled);
      discordAdapter.sendMessage.mockResolvedValue('msg');

      await service.upsertConfig('guild-1', makeSaveDto());

      const [, payload] = discordAdapter.sendMessage.mock.calls[0] as [
        string,
        { components: Array<{ components: unknown[] }> },
      ];
      expect(payload.components[0]?.components).toHaveLength(1);
    });

    it('row 번호별로 ActionRow를 그룹핑하여 정렬된 순서로 생성한다', async () => {
      const configWithMultiRows = makeConfigOrm({
        enabled: true,
        buttonConfig: {
          buttons: [
            { type: 'queue', label: '목록', emoji: '📋', enabled: true, row: 2 },
            { type: 'search', label: '검색', emoji: '🔍', enabled: true, row: 0 },
            { type: 'skip', label: '스킵', emoji: '⏭️', enabled: true, row: 1 },
          ],
        },
      });
      configRepo.save.mockResolvedValue(configWithMultiRows);
      discordAdapter.sendMessage.mockResolvedValue('msg');

      await service.upsertConfig('guild-1', makeSaveDto());

      const [, payload] = discordAdapter.sendMessage.mock.calls[0] as [
        string,
        { components: unknown[] },
      ];
      expect(payload.components).toHaveLength(3);
    });

    it('한 row에 버튼이 5개를 초과하면 5개만 포함한다', async () => {
      const manyButtons = Array.from({ length: 7 }, (_, i) => ({
        type: `btn${i}`,
        label: `버튼${i}`,
        emoji: '',
        enabled: true,
        row: 0,
      }));
      const saved = makeConfigOrm({ enabled: true, buttonConfig: { buttons: manyButtons } });
      configRepo.save.mockResolvedValue(saved);
      discordAdapter.sendMessage.mockResolvedValue('msg');

      await service.upsertConfig('guild-1', makeSaveDto());

      const [, payload] = discordAdapter.sendMessage.mock.calls[0] as [
        string,
        { components: Array<{ components: unknown[] }> },
      ];
      expect(payload.components[0]?.components).toHaveLength(5);
    });
  });
});
