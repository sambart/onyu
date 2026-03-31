import type { Mock } from 'vitest';

import { ChartCrawlerService } from './chart-crawler.service';

describe('ChartCrawlerService', () => {
  let service: ChartCrawlerService;
  let mockRedis: {
    get: Mock;
    setex: Mock;
  };

  beforeEach(() => {
    mockRedis = {
      get: vi.fn(),
      setex: vi.fn().mockResolvedValue('OK'),
    };

    // @Inject('REDIS_CLIENT') 토큰은 NestJS DI를 통해 주입되지만
    // 단위 테스트에서는 생성자에 직접 전달한다
    service = new ChartCrawlerService(mockRedis as never);
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────
  // getMelonChart
  // ─────────────────────────────────────────────────────────
  describe('getMelonChart', () => {
    it('Redis 캐시 히트: 캐시된 데이터를 파싱하여 반환한다', async () => {
      const cached = [
        { rank: 1, title: '봄날', artist: 'BTS' },
        { rank: 2, title: 'Dynamite', artist: 'BTS' },
      ];
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getMelonChart();

      expect(mockRedis.get).toHaveBeenCalledWith('music:chart:melon');
      expect(result).toEqual(cached);
    });

    it('Redis 캐시 히트: 크롤링을 수행하지 않는다', async () => {
      const cached = [{ rank: 1, title: 'test', artist: 'artist' }];
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      // fetch를 mock하여 호출 여부 확인
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        text: vi.fn(),
      } as never);

      await service.getMelonChart();

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('Redis 캐시 미스: 크롤링 후 결과를 Redis에 1시간 TTL로 저장한다', async () => {
      mockRedis.get.mockResolvedValue(null);

      const mockHtml = `
        <table>
          <tr class="lst50">
            <td class="rank">1</td>
            <td><div class="rank01"><span><a>봄날</a></span></div></td>
            <td><div class="rank02"><span>BTS</span></div></td>
          </tr>
        </table>
      `;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        text: vi.fn().mockResolvedValue(mockHtml),
      } as never);

      await service.getMelonChart();

      // 캐시 저장 확인 (TTL 3600초)
      expect(mockRedis.setex).toHaveBeenCalledWith('music:chart:melon', 3600, expect.any(String));

      vi.restoreAllMocks();
    });

    it('Redis 캐시 미스: 크롤링 실패 시 빈 배열을 반환한다', async () => {
      mockRedis.get.mockResolvedValue(null);

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await service.getMelonChart();

      expect(result).toEqual([]);
      vi.restoreAllMocks();
    });

    it('캐시 데이터가 배열로 파싱된다', async () => {
      const cached = [
        { rank: 1, title: '트랙1', artist: '아티스트1' },
        { rank: 2, title: '트랙2', artist: '아티스트2' },
      ];
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getMelonChart();

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toMatchObject({ rank: 1, title: '트랙1', artist: '아티스트1' });
    });
  });

  // ─────────────────────────────────────────────────────────
  // getBillboardChart
  // ─────────────────────────────────────────────────────────
  describe('getBillboardChart', () => {
    it('Redis 캐시 히트: 캐시된 데이터를 파싱하여 반환한다', async () => {
      const cached = [{ rank: 1, title: 'Blinding Lights', artist: 'The Weeknd' }];
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getBillboardChart();

      expect(mockRedis.get).toHaveBeenCalledWith('music:chart:billboard');
      expect(result).toEqual(cached);
    });

    it('Redis 캐시 히트: 크롤링을 수행하지 않는다', async () => {
      const cached = [{ rank: 1, title: 'test', artist: 'artist' }];
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        text: vi.fn(),
      } as never);

      await service.getBillboardChart();

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('Redis 캐시 미스: 크롤링 후 결과를 Redis에 1시간 TTL로 저장한다', async () => {
      mockRedis.get.mockResolvedValue(null);

      const mockHtml = `
        <ul>
          <li class="o-chart-results-list__item">
            <h3 id="title-of-a-story">Flowers</h3>
            <span class="c-label">Miley Cyrus</span>
          </li>
        </ul>
      `;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        text: vi.fn().mockResolvedValue(mockHtml),
      } as never);

      await service.getBillboardChart();

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'music:chart:billboard',
        3600,
        expect.any(String),
      );

      vi.restoreAllMocks();
    });

    it('Redis 캐시 미스: 크롤링 실패 시 빈 배열을 반환한다', async () => {
      mockRedis.get.mockResolvedValue(null);

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await service.getBillboardChart();

      expect(result).toEqual([]);
      vi.restoreAllMocks();
    });

    it('멜론과 빌보드는 서로 다른 캐시 키를 사용한다', async () => {
      const melonCached = [{ rank: 1, title: '멜론곡', artist: '아티스트' }];
      const billboardCached = [{ rank: 1, title: 'Billboard Song', artist: 'Artist' }];

      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(melonCached))
        .mockResolvedValueOnce(JSON.stringify(billboardCached));

      const melonResult = await service.getMelonChart();
      const billboardResult = await service.getBillboardChart();

      expect(mockRedis.get).toHaveBeenNthCalledWith(1, 'music:chart:melon');
      expect(mockRedis.get).toHaveBeenNthCalledWith(2, 'music:chart:billboard');
      expect(melonResult[0]?.title).toBe('멜론곡');
      expect(billboardResult[0]?.title).toBe('Billboard Song');
    });
  });
});
