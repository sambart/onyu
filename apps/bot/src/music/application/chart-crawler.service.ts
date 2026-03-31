import { Inject, Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type Redis from 'ioredis';

const REDIS_CLIENT = 'REDIS_CLIENT';

const MELON_CHART_CACHE_KEY = 'music:chart:melon';
const BILLBOARD_CHART_CACHE_KEY = 'music:chart:billboard';
const CHART_CACHE_TTL_SECONDS = 3600;
const CHART_TOP_COUNT = 20;

interface ChartEntry {
  rank: number;
  title: string;
  artist: string;
}

/**
 * 멜론·빌보드 차트 크롤링 및 Redis 캐싱 서비스.
 * Redis 캐시 키: music:chart:melon / music:chart:billboard, TTL 1시간.
 */
@Injectable()
export class ChartCrawlerService {
  private readonly logger = new Logger(ChartCrawlerService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * 멜론 인기차트 TOP 20 조회.
   * Redis 캐시 확인 → 미스 시 크롤링 → 캐시 저장.
   */
  async getMelonChart(): Promise<ChartEntry[]> {
    const cached = await this.redis.get(MELON_CHART_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as ChartEntry[];
    }

    const entries = await this.crawlMelon();
    await this.redis.setex(MELON_CHART_CACHE_KEY, CHART_CACHE_TTL_SECONDS, JSON.stringify(entries));
    return entries;
  }

  /**
   * 빌보드 HOT 100 TOP 20 조회.
   * Redis 캐시 확인 → 미스 시 크롤링 → 캐시 저장.
   */
  async getBillboardChart(): Promise<ChartEntry[]> {
    const cached = await this.redis.get(BILLBOARD_CHART_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as ChartEntry[];
    }

    const entries = await this.crawlBillboard();
    await this.redis.setex(
      BILLBOARD_CHART_CACHE_KEY,
      CHART_CACHE_TTL_SECONDS,
      JSON.stringify(entries),
    );
    return entries;
  }

  /** 멜론 인기차트 크롤링 (cheerio 사용). */
  private async crawlMelon(): Promise<ChartEntry[]> {
    const MELON_CHART_URL = 'https://www.melon.com/chart/index.htm';
    const entries: ChartEntry[] = [];

    try {
      const response = await fetch(MELON_CHART_URL, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Cookie: 'MELLONZE=1',
        },
      });
      const html = await response.text();
      const $ = cheerio.load(html);

      $('tr.lst50, tr.lst100')
        .slice(0, CHART_TOP_COUNT)
        .each((i, el) => {
          const rank = parseInt($(el).find('.rank').text().trim(), 10);
          const title = $(el).find('.rank01 span a').text().trim();
          const artist = $(el).find('.rank02 span').first().text().trim();

          if (title && artist) {
            entries.push({ rank: isNaN(rank) ? i + 1 : rank, title, artist });
          }
        });
    } catch (err) {
      this.logger.error('[CHART] Melon crawling failed', err instanceof Error ? err.stack : err);
    }

    return entries.slice(0, CHART_TOP_COUNT);
  }

  /** 빌보드 HOT 100 크롤링 (cheerio 사용). */
  private async crawlBillboard(): Promise<ChartEntry[]> {
    const BILLBOARD_CHART_URL = 'https://www.billboard.com/charts/hot-100/';
    const entries: ChartEntry[] = [];

    try {
      const response = await fetch(BILLBOARD_CHART_URL, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      const html = await response.text();
      const $ = cheerio.load(html);

      $('li.o-chart-results-list__item')
        .slice(0, CHART_TOP_COUNT)
        .each((i, el) => {
          const title = $(el).find('h3#title-of-a-story').text().trim();
          const artist = $(el).find('span.c-label').first().text().trim();

          if (title && artist) {
            entries.push({ rank: i + 1, title, artist });
          }
        });
    } catch (err) {
      this.logger.error(
        '[CHART] Billboard crawling failed',
        err instanceof Error ? err.stack : err,
      );
    }

    return entries.slice(0, CHART_TOP_COUNT);
  }
}
