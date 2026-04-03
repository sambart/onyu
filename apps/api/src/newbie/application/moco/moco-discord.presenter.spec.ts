import { type Mocked, vi } from 'vitest';

import { type DiscordRestService } from '../../../discord-rest/discord-rest.service';
import { type RedisService } from '../../../redis/redis.service';
import { type NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';
import { type NewbieConfigRepository } from '../../infrastructure/newbie-config.repository';
import { type NewbieMocoTemplateRepository } from '../../infrastructure/newbie-moco-template.repository';
import { MocoDiscordPresenter } from './moco-discord.presenter';

function makeConfig(overrides: Partial<NewbieConfig> = {}): NewbieConfig {
  return {
    id: 1,
    guildId: 'guild-1',
    mocoEnabled: true,
    mocoRankChannelId: 'ch-rank',
    mocoRankMessageId: null,
    mocoDisplayMode: 'CANVAS',
    mocoScorePerSession: 10,
    mocoScorePerMinute: 1,
    mocoScorePerUnique: 5,
    mocoMinCoPresenceMin: 10,
    mocoAutoRefreshMinutes: null,
    mocoResetPeriod: 'NONE',
    mocoResetIntervalDays: null,
    mocoCurrentPeriodStart: null,
    mocoEmbedColor: null,
    mocoEmbedThumbnailUrl: null,
    ...overrides,
  } as NewbieConfig;
}

describe('MocoDiscordPresenter', () => {
  let presenter: MocoDiscordPresenter;
  let configRepo: Mocked<NewbieConfigRepository>;
  let mocoTmplRepo: Mocked<NewbieMocoTemplateRepository>;
  let discordRest: Mocked<DiscordRestService>;
  let redis: Mocked<RedisService>;

  const fakeBuffer = Buffer.from('fake-png-data');

  beforeEach(() => {
    configRepo = {
      findByGuildId: vi.fn(),
      updateMocoRankMessageId: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<NewbieConfigRepository>;

    mocoTmplRepo = {
      findByGuildId: vi.fn().mockResolvedValue(null),
    } as unknown as Mocked<NewbieMocoTemplateRepository>;

    discordRest = {
      sendMessage: vi.fn().mockResolvedValue({ id: 'new-msg-id' }),
      editMessage: vi.fn().mockResolvedValue({ id: 'msg-id' }),
      sendMessageWithFiles: vi.fn().mockResolvedValue({ id: 'new-canvas-msg-id' }),
      editMessageWithFiles: vi.fn().mockResolvedValue({ id: 'canvas-msg-id' }),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
      fetchGuildMember: vi.fn().mockResolvedValue(null),
      getMemberDisplayName: vi.fn().mockReturnValue('TestUser'),
    } as unknown as Mocked<DiscordRestService>;

    redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<RedisService>;

    presenter = new MocoDiscordPresenter(configRepo, mocoTmplRepo, discordRest, redis);
  });

  describe('buildCanvasButtons', () => {
    it('buildCanvasButtons는 ActionRow를 반환해야 한다', () => {
      const row = presenter.buildCanvasButtons('guild-1', 1, 5);

      expect(row).toBeDefined();
      expect(typeof row.toJSON).toBe('function');
    });

    it('buildCanvasButtons의 결과에 이전/다음/갱신/내 사냥 시간 버튼이 포함되어야 한다', () => {
      const row = presenter.buildCanvasButtons('guild-1', 2, 5);
      const json = row.toJSON();

      expect(json.components).toHaveLength(4);
    });

    it('첫 페이지에서 이전 버튼이 비활성화되어야 한다', () => {
      const row = presenter.buildCanvasButtons('guild-1', 1, 5);
      const json = row.toJSON();
      const prevButton = json.components[0];

      expect(prevButton?.disabled).toBe(true);
    });

    it('마지막 페이지에서 다음 버튼이 비활성화되어야 한다', () => {
      const row = presenter.buildCanvasButtons('guild-1', 5, 5);
      const json = row.toJSON();
      const nextButton = json.components[1];

      expect(nextButton?.disabled).toBe(true);
    });

    it('중간 페이지에서 이전/다음 버튼이 모두 활성화되어야 한다', () => {
      const row = presenter.buildCanvasButtons('guild-1', 3, 5);
      const json = row.toJSON();

      expect(json.components[0]?.disabled).toBe(false);
      expect(json.components[1]?.disabled).toBe(false);
    });
  });

  describe('sendOrUpdateCanvasRank', () => {
    it('mocoRankChannelId가 없으면 아무것도 하지 않아야 한다', async () => {
      const config = makeConfig({ mocoRankChannelId: null });

      await presenter.sendOrUpdateCanvasRank(config, 'guild-1', {
        imageBuffer: fakeBuffer,
        components: [],
      });

      expect(discordRest.sendMessageWithFiles).not.toHaveBeenCalled();
      expect(discordRest.editMessageWithFiles).not.toHaveBeenCalled();
    });

    it('mocoRankMessageId가 없으면 sendMessageWithFiles를 호출해야 한다', async () => {
      const config = makeConfig({ mocoRankChannelId: 'ch-rank', mocoRankMessageId: null });

      await presenter.sendOrUpdateCanvasRank(config, 'guild-1', {
        imageBuffer: fakeBuffer,
        components: [],
      });

      expect(discordRest.sendMessageWithFiles).toHaveBeenCalledWith(
        'ch-rank',
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({ name: 'moco-rank.png', data: fakeBuffer }),
        ]),
      );
    });

    it('mocoRankMessageId가 있으면 editMessageWithFiles를 호출해야 한다', async () => {
      const config = makeConfig({
        mocoRankChannelId: 'ch-rank',
        mocoRankMessageId: 'existing-msg',
      });

      await presenter.sendOrUpdateCanvasRank(config, 'guild-1', {
        imageBuffer: fakeBuffer,
        components: [],
      });

      expect(discordRest.editMessageWithFiles).toHaveBeenCalledWith(
        'ch-rank',
        'existing-msg',
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({ name: 'moco-rank.png', data: fakeBuffer }),
        ]),
      );
    });

    it('sendMessageWithFiles 성공 후 mocoRankMessageId를 새 메시지 ID로 저장해야 한다', async () => {
      const config = makeConfig({ mocoRankChannelId: 'ch-rank', mocoRankMessageId: null });
      discordRest.sendMessageWithFiles.mockResolvedValue({ id: 'new-canvas-msg-id' } as never);

      await presenter.sendOrUpdateCanvasRank(config, 'guild-1', {
        imageBuffer: fakeBuffer,
        components: [],
      });

      expect(configRepo.updateMocoRankMessageId).toHaveBeenCalledWith(
        'guild-1',
        'new-canvas-msg-id',
      );
    });

    it('editMessageWithFiles 실패 시 sendMessageWithFiles로 fallback해야 한다', async () => {
      const config = makeConfig({
        mocoRankChannelId: 'ch-rank',
        mocoRankMessageId: 'old-msg',
      });
      discordRest.editMessageWithFiles.mockRejectedValue(new Error('편집 실패'));
      discordRest.sendMessageWithFiles.mockResolvedValue({ id: 'fallback-msg-id' } as never);

      await presenter.sendOrUpdateCanvasRank(config, 'guild-1', {
        imageBuffer: fakeBuffer,
        components: [],
      });

      expect(discordRest.sendMessageWithFiles).toHaveBeenCalled();
    });

    it('editMessageWithFiles 실패 시 mocoRankMessageId를 null로 초기화해야 한다', async () => {
      const config = makeConfig({
        mocoRankChannelId: 'ch-rank',
        mocoRankMessageId: 'old-msg',
      });
      discordRest.editMessageWithFiles.mockRejectedValue(new Error('편집 실패'));
      discordRest.sendMessageWithFiles.mockResolvedValue({ id: 'fallback-msg-id' } as never);

      await presenter.sendOrUpdateCanvasRank(config, 'guild-1', {
        imageBuffer: fakeBuffer,
        components: [],
      });

      expect(configRepo.updateMocoRankMessageId).toHaveBeenCalledWith('guild-1', null);
    });

    it('PNG 파일 첨부 payload에 moco-rank.png 파일명이 포함되어야 한다', async () => {
      const config = makeConfig({ mocoRankChannelId: 'ch-rank', mocoRankMessageId: null });

      await presenter.sendOrUpdateCanvasRank(config, 'guild-1', {
        imageBuffer: fakeBuffer,
        components: [],
      });

      const filesArg = discordRest.sendMessageWithFiles.mock.calls[0]?.[2];
      expect(filesArg).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'moco-rank.png' })]),
      );
    });

    it('sendMessageWithFiles 실패 시 예외가 밖으로 전파되지 않아야 한다', async () => {
      const config = makeConfig({ mocoRankChannelId: 'ch-rank', mocoRankMessageId: null });
      discordRest.sendMessageWithFiles.mockRejectedValue(new Error('Discord 오류'));

      await expect(
        presenter.sendOrUpdateCanvasRank(config, 'guild-1', {
          imageBuffer: fakeBuffer,
          components: [],
        }),
      ).resolves.not.toThrow();
    });
  });
});
