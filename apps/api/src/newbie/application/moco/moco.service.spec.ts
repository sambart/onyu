import { type Mocked, vi } from 'vitest';

import { type RedisService } from '../../../redis/redis.service';
import { type NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';
import { type NewbieConfigRepository } from '../../infrastructure/newbie-config.repository';
import { type NewbieRedisRepository } from '../../infrastructure/newbie-redis.repository';
import { MocoService } from './moco.service';
import { type MocoDiscordPresenter } from './moco-discord.presenter';
import { type MocoRankRenderer } from './moco-rank.renderer';

function makeConfig(overrides: Partial<NewbieConfig> = {}): NewbieConfig {
  return {
    id: 1,
    guildId: 'guild-1',
    mocoEnabled: true,
    mocoRankChannelId: 'ch-rank',
    mocoRankMessageId: 'msg-1',
    mocoDisplayMode: 'EMBED',
    mocoScorePerSession: 10,
    mocoScorePerMinute: 1,
    mocoScorePerUnique: 5,
    mocoMinCoPresenceMin: 10,
    mocoResetPeriod: 'NONE',
    mocoResetIntervalDays: null,
    mocoCurrentPeriodStart: null,
    mocoEmbedColor: null,
    ...overrides,
  } as NewbieConfig;
}

describe('MocoService', () => {
  let service: MocoService;
  let configRepo: Mocked<NewbieConfigRepository>;
  let newbieRedis: Mocked<NewbieRedisRepository>;
  let presenter: Mocked<MocoDiscordPresenter>;
  let renderer: Mocked<MocoRankRenderer>;
  let redis: Mocked<RedisService>;

  const fakeBuffer = Buffer.from('fake-png-data');

  beforeEach(() => {
    configRepo = {
      findByGuildId: vi.fn().mockResolvedValue(makeConfig()),
    } as unknown as Mocked<NewbieConfigRepository>;

    newbieRedis = {
      getMocoRankCount: vi.fn().mockResolvedValue(0),
      getMocoRankPage: vi.fn().mockResolvedValue([]),
      getMocoHunterScore: vi.fn().mockResolvedValue(null),
      getMocoHunterRank: vi.fn().mockResolvedValue(null),
      getMocoHunterDetail: vi.fn().mockResolvedValue({}),
      getMocoHunterMeta: vi.fn().mockResolvedValue(null),
      getMocoNewbieSessions: vi.fn().mockResolvedValue({}),
    } as unknown as Mocked<NewbieRedisRepository>;

    presenter = {
      buildRankPayload: vi.fn().mockResolvedValue({ embeds: [], components: [] }),
      deleteEmbed: vi.fn().mockResolvedValue(undefined),
      sendOrUpdateRankEmbed: vi.fn().mockResolvedValue(undefined),
      sendOrUpdateCanvasRank: vi.fn().mockResolvedValue(undefined),
      fetchDisplayNames: vi.fn().mockResolvedValue({}),
      buildCanvasButtons: vi.fn().mockReturnValue({ toJSON: vi.fn().mockReturnValue({}) }),
    } as unknown as Mocked<MocoDiscordPresenter>;

    renderer = {
      renderRankBoard: vi.fn().mockResolvedValue(fakeBuffer),
      renderHunterDetail: vi.fn().mockResolvedValue(fakeBuffer),
    } as unknown as Mocked<MocoRankRenderer>;

    redis = {
      getBuffer: vi.fn().mockResolvedValue(null),
      setBuffer: vi.fn().mockResolvedValue(undefined),
      deleteByPattern: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<RedisService>;

    service = new MocoService(configRepo, newbieRedis, presenter, renderer, redis);
  });

  describe('buildRankPayload', () => {
    it('config와 rank 데이터로 payload를 구성한다', async () => {
      newbieRedis.getMocoRankCount.mockResolvedValue(0);
      newbieRedis.getMocoRankPage.mockResolvedValue([]);

      await service.buildRankPayload('guild-1', 1);

      expect(configRepo.findByGuildId).toHaveBeenCalledWith('guild-1');
      expect(presenter.buildRankPayload).toHaveBeenCalled();
    });
  });

  describe('deleteEmbed', () => {
    it('presenter의 deleteEmbed를 호출한다', async () => {
      await service.deleteEmbed('ch-1', 'msg-1');

      expect(presenter.deleteEmbed).toHaveBeenCalledWith('ch-1', 'msg-1');
    });
  });

  describe('sendOrUpdateRankEmbed', () => {
    it('mocoRankChannelId가 설정되어 있으면 Embed를 전송/수정한다', async () => {
      newbieRedis.getMocoRankCount.mockResolvedValue(0);
      newbieRedis.getMocoRankPage.mockResolvedValue([]);

      await service.sendOrUpdateRankEmbed('guild-1', 1);

      expect(presenter.sendOrUpdateRankEmbed).toHaveBeenCalled();
    });

    it('mocoRankChannelId가 없으면 아무것도 하지 않는다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoRankChannelId: null }));

      await service.sendOrUpdateRankEmbed('guild-1', 1);

      expect(presenter.sendOrUpdateRankEmbed).not.toHaveBeenCalled();
    });

    it('config가 null이면 아무것도 하지 않는다', async () => {
      configRepo.findByGuildId.mockResolvedValue(null as never);

      await service.sendOrUpdateRankEmbed('guild-1', 1);

      expect(presenter.sendOrUpdateRankEmbed).not.toHaveBeenCalled();
    });
  });

  describe('buildMyHuntingMessage', () => {
    it('사냥 기록이 없으면 안내 메시지를 반환한다', async () => {
      newbieRedis.getMocoHunterScore.mockResolvedValue(null);
      newbieRedis.getMocoHunterRank.mockResolvedValue(null);

      const result = await service.buildMyHuntingMessage('guild-1', 'user-1');

      expect(result).toBe('아직 모코코 사냥 기록이 없습니다.');
    });

    it('사냥 기록이 있으면 통계 메시지를 반환한다', async () => {
      newbieRedis.getMocoHunterScore.mockResolvedValue(150);
      newbieRedis.getMocoHunterRank.mockResolvedValue(3);
      newbieRedis.getMocoRankCount.mockResolvedValue(10);
      newbieRedis.getMocoHunterMeta.mockResolvedValue({
        score: 200,
        sessionCount: 5,
        uniqueNewbieCount: 3,
        totalMinutes: 150,
      });
      newbieRedis.getMocoHunterDetail.mockResolvedValue({});
      newbieRedis.getMocoNewbieSessions.mockResolvedValue({});

      const result = await service.buildMyHuntingMessage('guild-1', 'user-1');

      expect(result).toContain('3위');
      expect(result).toContain('10명');
      expect(result).toContain('200점');
      expect(result).toContain('150분');
      expect(result).toContain('5회');
      expect(result).toContain('3명');
    });

    it('도움 받은 모코코 목록을 포함한다', async () => {
      newbieRedis.getMocoHunterScore.mockResolvedValue(100);
      newbieRedis.getMocoHunterRank.mockResolvedValue(1);
      newbieRedis.getMocoRankCount.mockResolvedValue(5);
      newbieRedis.getMocoHunterMeta.mockResolvedValue(null);
      newbieRedis.getMocoHunterDetail.mockResolvedValue({
        'newbie-1': 60,
        'newbie-2': 30,
      });
      newbieRedis.getMocoNewbieSessions.mockResolvedValue({
        'newbie-1': 3,
        'newbie-2': 1,
      });
      presenter.fetchDisplayNames.mockResolvedValue({
        'newbie-1': '모코코A',
        'newbie-2': '모코코B',
      });

      const result = await service.buildMyHuntingMessage('guild-1', 'user-1');

      expect(result).toContain('모코코A');
      expect(result).toContain('60분');
      expect(result).toContain('3회');
      expect(result).toContain('모코코B');
    });
  });

  describe('getHunterDetail', () => {
    it('사냥꾼의 모코코 상세 목록을 반환한다', async () => {
      newbieRedis.getMocoHunterDetail.mockResolvedValue({
        'n-1': 60,
        'n-2': 30,
      });
      newbieRedis.getMocoNewbieSessions.mockResolvedValue({
        'n-1': 3,
        'n-2': 1,
      });
      presenter.fetchDisplayNames.mockResolvedValue({
        'n-1': 'Newbie1',
        'n-2': 'Newbie2',
      });

      const result = await service.getHunterDetail('guild-1', 'hunter-1');

      expect(result).toEqual([
        { newbieId: 'n-1', newbieName: 'Newbie1', minutes: 60, sessions: 3 },
        { newbieId: 'n-2', newbieName: 'Newbie2', minutes: 30, sessions: 1 },
      ]);
    });

    it('상세 정보가 없으면 빈 배열을 반환한다', async () => {
      newbieRedis.getMocoHunterDetail.mockResolvedValue({});

      const result = await service.getHunterDetail('guild-1', 'hunter-1');

      expect(result).toEqual([]);
    });

    it('minutes 기준으로 내림차순 정렬한다', async () => {
      newbieRedis.getMocoHunterDetail.mockResolvedValue({
        'n-1': 10,
        'n-2': 50,
        'n-3': 30,
      });
      newbieRedis.getMocoNewbieSessions.mockResolvedValue({});
      presenter.fetchDisplayNames.mockResolvedValue({});

      const result = await service.getHunterDetail('guild-1', 'hunter-1');

      expect(result[0]!.minutes).toBe(50);
      expect(result[1]!.minutes).toBe(30);
      expect(result[2]!.minutes).toBe(10);
    });
  });

  describe('buildRankPayload — Canvas 모드 분기', () => {
    it('mocoDisplayMode가 CANVAS일 때 mode: CANVAS payload를 반환해야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      newbieRedis.getMocoRankCount.mockResolvedValue(0);
      newbieRedis.getMocoRankPage.mockResolvedValue([]);

      const result = await service.buildRankPayload('guild-1', 1);

      expect(result.mode).toBe('CANVAS');
    });

    it('mocoDisplayMode가 CANVAS일 때 renderer.renderRankBoard를 호출해야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      newbieRedis.getMocoRankCount.mockResolvedValue(0);
      newbieRedis.getMocoRankPage.mockResolvedValue([]);

      await service.buildRankPayload('guild-1', 1);

      expect(renderer.renderRankBoard).toHaveBeenCalled();
    });

    it('mocoDisplayMode가 CANVAS일 때 imageBuffer가 Buffer 타입이어야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      newbieRedis.getMocoRankCount.mockResolvedValue(0);
      newbieRedis.getMocoRankPage.mockResolvedValue([]);

      const result = await service.buildRankPayload('guild-1', 1);

      if (result.mode === 'CANVAS') {
        expect(result.imageBuffer).toBeInstanceOf(Buffer);
      } else {
        throw new Error('CANVAS 모드를 기대했지만 EMBED 모드가 반환됨');
      }
    });

    it('mocoDisplayMode가 EMBED일 때 presenter.buildRankPayload를 호출해야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'EMBED' }));

      await service.buildRankPayload('guild-1', 1);

      expect(presenter.buildRankPayload).toHaveBeenCalled();
      expect(renderer.renderRankBoard).not.toHaveBeenCalled();
    });

    it('mocoDisplayMode가 EMBED일 때 mode: EMBED payload를 반환해야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'EMBED' }));

      const result = await service.buildRankPayload('guild-1', 1);

      expect(result.mode).toBe('EMBED');
    });

    it('Canvas 캐시 히트 시 renderer.renderRankBoard를 호출하지 않아야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      redis.getBuffer.mockResolvedValue(fakeBuffer);
      newbieRedis.getMocoRankCount.mockResolvedValue(20);

      const result = await service.buildRankPayload('guild-1', 1);

      expect(renderer.renderRankBoard).not.toHaveBeenCalled();
      expect(result.mode).toBe('CANVAS');
      if (result.mode === 'CANVAS') {
        expect(result.imageBuffer).toBe(fakeBuffer);
      }
    });

    it('Canvas 캐시 미스 시 렌더링 결과를 Redis에 저장해야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      redis.getBuffer.mockResolvedValue(null);
      newbieRedis.getMocoRankCount.mockResolvedValue(0);
      newbieRedis.getMocoRankPage.mockResolvedValue([]);

      await service.buildRankPayload('guild-1', 1);

      expect(redis.setBuffer).toHaveBeenCalledWith(
        expect.stringContaining('newbie:moco:canvas:guild-1:rank:1'),
        fakeBuffer,
        30,
      );
    });

    it('Canvas 모드에서 10명 데이터를 가져와야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      redis.getBuffer.mockResolvedValue(null);
      newbieRedis.getMocoRankCount.mockResolvedValue(25);
      newbieRedis.getMocoRankPage.mockResolvedValue([]);

      await service.buildRankPayload('guild-1', 1);

      expect(newbieRedis.getMocoRankPage).toHaveBeenCalledWith('guild-1', 1, 10);
    });

    it('Canvas 모드에서 totalPages는 ceil(totalCount / 10)이어야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      redis.getBuffer.mockResolvedValue(null);
      newbieRedis.getMocoRankCount.mockResolvedValue(25);
      newbieRedis.getMocoRankPage.mockResolvedValue([]);

      await service.buildRankPayload('guild-1', 1);

      // 25명 / 10명 = 3페이지
      expect(presenter.buildCanvasButtons).toHaveBeenCalledWith('guild-1', 1, 3);
    });

    it('Canvas 모드에서 totalCount가 0이면 totalPages는 1이어야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      redis.getBuffer.mockResolvedValue(null);
      newbieRedis.getMocoRankCount.mockResolvedValue(0);
      newbieRedis.getMocoRankPage.mockResolvedValue([]);

      await service.buildRankPayload('guild-1', 1);

      expect(presenter.buildCanvasButtons).toHaveBeenCalledWith('guild-1', 1, 1);
    });

    it('Canvas 모드에서 page가 totalPages를 초과하면 totalPages로 clamp되어야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      redis.getBuffer.mockResolvedValue(null);
      newbieRedis.getMocoRankCount.mockResolvedValue(5);
      newbieRedis.getMocoRankPage.mockResolvedValue([]);

      await service.buildRankPayload('guild-1', 99);

      // 5명 / 10명 = 1페이지, page=99 → clamp → 1
      expect(newbieRedis.getMocoRankPage).toHaveBeenCalledWith('guild-1', 1, 10);
    });

    it('Canvas 모드에서 page < 1이면 1로 clamp되어야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      redis.getBuffer.mockResolvedValue(null);
      newbieRedis.getMocoRankCount.mockResolvedValue(20);
      newbieRedis.getMocoRankPage.mockResolvedValue([]);

      await service.buildRankPayload('guild-1', -5);

      expect(newbieRedis.getMocoRankPage).toHaveBeenCalledWith('guild-1', 1, 10);
    });

    it('Canvas 모드에서 rank 계산이 올바르게 되어야 한다 (page 2면 11위부터)', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      redis.getBuffer.mockResolvedValue(null);
      newbieRedis.getMocoRankCount.mockResolvedValue(20);
      newbieRedis.getMocoRankPage.mockResolvedValue([{ hunterId: 'h-11', totalMinutes: 100 }]);
      newbieRedis.getMocoHunterMeta.mockResolvedValue(null);
      presenter.fetchDisplayNames.mockResolvedValue({ 'h-11': 'Hunter11' });

      await service.buildRankPayload('guild-1', 2);

      // page 2의 첫 번째 항목은 rank 11
      expect(renderer.renderRankBoard).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: expect.arrayContaining([expect.objectContaining({ rank: 11 })]),
        }),
        expect.anything(),
      );
    });
  });

  describe('buildMyHunting — Canvas 모드 분기', () => {
    it('mocoDisplayMode가 CANVAS일 때 mode: CANVAS 결과를 반환해야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      newbieRedis.getMocoHunterScore.mockResolvedValue(100);
      newbieRedis.getMocoHunterRank.mockResolvedValue(1);
      newbieRedis.getMocoRankCount.mockResolvedValue(5);
      newbieRedis.getMocoHunterDetail.mockResolvedValue({});
      newbieRedis.getMocoHunterMeta.mockResolvedValue(null);
      newbieRedis.getMocoNewbieSessions.mockResolvedValue({});
      presenter.fetchDisplayNames.mockResolvedValue({ 'user-1': 'Hunter' });

      const result = await service.buildMyHunting('guild-1', 'user-1');

      expect(result.mode).toBe('CANVAS');
    });

    it('mocoDisplayMode가 CANVAS일 때 renderer.renderHunterDetail을 호출해야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      newbieRedis.getMocoHunterScore.mockResolvedValue(100);
      newbieRedis.getMocoHunterRank.mockResolvedValue(1);
      newbieRedis.getMocoRankCount.mockResolvedValue(5);
      newbieRedis.getMocoHunterDetail.mockResolvedValue({});
      newbieRedis.getMocoHunterMeta.mockResolvedValue(null);
      newbieRedis.getMocoNewbieSessions.mockResolvedValue({});
      presenter.fetchDisplayNames.mockResolvedValue({ 'user-1': 'Hunter' });

      await service.buildMyHunting('guild-1', 'user-1');

      expect(renderer.renderHunterDetail).toHaveBeenCalled();
    });

    it('mocoDisplayMode가 CANVAS일 때 imageBuffer가 Buffer 타입이어야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      newbieRedis.getMocoHunterScore.mockResolvedValue(100);
      newbieRedis.getMocoHunterRank.mockResolvedValue(1);
      newbieRedis.getMocoRankCount.mockResolvedValue(5);
      newbieRedis.getMocoHunterDetail.mockResolvedValue({});
      newbieRedis.getMocoHunterMeta.mockResolvedValue(null);
      newbieRedis.getMocoNewbieSessions.mockResolvedValue({});
      presenter.fetchDisplayNames.mockResolvedValue({ 'user-1': 'Hunter' });

      const result = await service.buildMyHunting('guild-1', 'user-1');

      if (result.mode === 'CANVAS') {
        expect(result.imageBuffer).toBeInstanceOf(Buffer);
      } else {
        throw new Error('CANVAS 모드를 기대했지만 EMBED 모드가 반환됨');
      }
    });

    it('mocoDisplayMode가 EMBED일 때 content 문자열을 반환해야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'EMBED' }));
      newbieRedis.getMocoHunterScore.mockResolvedValue(null);
      newbieRedis.getMocoHunterRank.mockResolvedValue(null);

      const result = await service.buildMyHunting('guild-1', 'user-1');

      expect(result.mode).toBe('EMBED');
      if (result.mode === 'EMBED') {
        expect(typeof result.content).toBe('string');
      }
    });

    it('Canvas 개인 상세 캐시 히트 시 renderer.renderHunterDetail을 호출하지 않아야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      redis.getBuffer.mockResolvedValue(fakeBuffer);

      const result = await service.buildMyHunting('guild-1', 'user-1');

      expect(renderer.renderHunterDetail).not.toHaveBeenCalled();
      expect(result.mode).toBe('CANVAS');
    });

    it('Canvas 개인 상세 캐시 미스 시 렌더링 결과를 Redis에 TTL 30초로 저장해야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      redis.getBuffer.mockResolvedValue(null);
      newbieRedis.getMocoHunterScore.mockResolvedValue(50);
      newbieRedis.getMocoHunterRank.mockResolvedValue(2);
      newbieRedis.getMocoRankCount.mockResolvedValue(10);
      newbieRedis.getMocoHunterDetail.mockResolvedValue({});
      newbieRedis.getMocoHunterMeta.mockResolvedValue(null);
      newbieRedis.getMocoNewbieSessions.mockResolvedValue({});
      presenter.fetchDisplayNames.mockResolvedValue({ 'user-1': 'Hunter' });

      await service.buildMyHunting('guild-1', 'user-1');

      expect(redis.setBuffer).toHaveBeenCalledWith(
        expect.stringContaining('newbie:moco:canvas:guild-1:detail:user-1'),
        fakeBuffer,
        30,
      );
    });
  });

  describe('sendOrUpdateRankEmbed — Canvas 모드 분기', () => {
    it('mocoDisplayMode가 CANVAS일 때 presenter.sendOrUpdateCanvasRank를 호출해야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      newbieRedis.getMocoRankCount.mockResolvedValue(0);
      newbieRedis.getMocoRankPage.mockResolvedValue([]);

      await service.sendOrUpdateRankEmbed('guild-1', 1);

      expect(presenter.sendOrUpdateCanvasRank).toHaveBeenCalled();
      expect(presenter.sendOrUpdateRankEmbed).not.toHaveBeenCalled();
    });

    it('mocoDisplayMode가 CANVAS일 때 presenter.sendOrUpdateRankEmbed를 호출하지 않아야 한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ mocoDisplayMode: 'CANVAS' }));
      newbieRedis.getMocoRankCount.mockResolvedValue(0);
      newbieRedis.getMocoRankPage.mockResolvedValue([]);

      await service.sendOrUpdateRankEmbed('guild-1', 1);

      expect(presenter.sendOrUpdateRankEmbed).not.toHaveBeenCalled();
    });
  });

  describe('invalidateCanvasCache', () => {
    it('redis.deleteByPattern에 올바른 패턴을 전달해야 한다', async () => {
      await service.invalidateCanvasCache('guild-1');

      expect(redis.deleteByPattern).toHaveBeenCalledWith('newbie:moco:canvas:guild-1:*');
    });

    it('다른 guildId에 대해 해당 패턴만 삭제해야 한다', async () => {
      await service.invalidateCanvasCache('guild-xyz');

      expect(redis.deleteByPattern).toHaveBeenCalledWith('newbie:moco:canvas:guild-xyz:*');
      expect(redis.deleteByPattern).not.toHaveBeenCalledWith('newbie:moco:canvas:guild-1:*');
    });
  });
});
