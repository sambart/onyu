import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import { getErrorMessage } from '../common/util/error.util';
import { DiscordRestService } from '../discord-rest/discord-rest.service';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Discord REST API와 통신하는 Gateway 클래스.
 * Discord 관련 이름/채널명 조회는 이 클래스를 통해 수행.
 * REST API 호출 결과를 내부 캐시에 보관하여 반복 조회 부하를 줄인다.
 */
@Injectable()
export class DiscordGateway implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DiscordGateway.name);

  private static readonly STRING_CACHE_MAX = 500;
  /** 캐시 TTL (ms): 5분 */
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;
  /** 만료 엔트리 정리 주기 (ms): 10분 */
  private static readonly CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
  /** LRU 제거 비율: 초과 시 캐시 크기의 10% 제거 */
  private static readonly CACHE_EVICT_RATIO = 0.1;

  private userCache = new Map<string, CacheEntry<string>>();
  private channelCache = new Map<string, CacheEntry<string>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly discordRest: DiscordRestService) {}

  onApplicationBootstrap(): void {
    this.cleanupInterval = setInterval(
      () => this.evictExpired(),
      DiscordGateway.CACHE_CLEANUP_INTERVAL_MS,
    );
  }

  onApplicationShutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearCache();
  }

  /** 모든 캐시에서 TTL 만료된 엔트리를 일괄 제거 */
  private evictExpired(): void {
    const now = Date.now();
    let evicted = 0;
    for (const cache of [this.userCache, this.channelCache]) {
      for (const [key, entry] of cache) {
        if (entry.expiresAt <= now) {
          cache.delete(key);
          evicted++;
        }
      }
    }
    if (evicted > 0) {
      this.logger.debug(`Cache cleanup: evicted ${evicted} expired entries`);
    }
  }

  /** 만료된 항목을 제거하고, 최대 크기 초과 시 LRU 방식으로 10% 제거 */
  private evictIfNeeded<T>(cache: Map<string, CacheEntry<T>>, maxSize: number) {
    const now = Date.now();

    // 만료 항목 제거
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key);
    }

    // 크기 초과 시 LRU 제거
    if (cache.size < maxSize) return;
    const evictCount = Math.ceil(cache.size * DiscordGateway.CACHE_EVICT_RATIO);
    let removed = 0;
    for (const key of cache.keys()) {
      if (removed >= evictCount) break;
      cache.delete(key);
      removed++;
    }
    this.logger.debug(`Cache evicted ${removed} entries (LRU)`);
  }

  /** 캐시 조회 시 TTL 확인 및 LRU 순서 갱신 (삭제 후 재삽입) */
  private touchCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return undefined;
    }

    // LRU 순서 갱신
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
  }

  private putCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
    cache.set(key, { value, expiresAt: Date.now() + DiscordGateway.CACHE_TTL_MS });
  }

  /**
   * Guild 이름 가져오기
   */
  async getGuildName(guildId: string): Promise<string> {
    const guild = await this.discordRest.fetchGuild(guildId);
    return guild ? guild.name : `Guild-${guildId.slice(0, 6)}`;
  }

  /**
   * 유저명 가져오기 (캐시 사용)
   */
  async getUserName(guildId: string, userId: string): Promise<string> {
    try {
      const cacheKey = `${guildId}:${userId}`;
      const cached = this.touchCache(this.userCache, cacheKey);
      if (cached) return cached;

      const member = await this.discordRest.fetchGuildMember(guildId, userId);
      const username = member
        ? this.discordRest.getMemberDisplayName(member)
        : `User-${userId.slice(0, 6)}`;

      this.evictIfNeeded(this.userCache, DiscordGateway.STRING_CACHE_MAX);
      this.putCache(this.userCache, cacheKey, username);
      return username;
    } catch (error) {
      this.logger.warn(`Failed to fetch user ${userId}:`, getErrorMessage(error));
      return `User-${userId.slice(0, 6)}`;
    }
  }

  async getChannelName(guildId: string, channelId: string): Promise<string> {
    try {
      if (channelId === 'GLOBAL') {
        return '전체';
      }

      const cacheKey = `${guildId}:${channelId}`;
      const cached = this.touchCache(this.channelCache, cacheKey);
      if (cached) return cached;

      const channel = await this.discordRest.fetchChannel(channelId);
      const channelName =
        channel && 'name' in channel && channel.name
          ? channel.name
          : `Channel-${channelId.slice(0, 6)}`;

      this.evictIfNeeded(this.channelCache, DiscordGateway.STRING_CACHE_MAX);
      this.putCache(this.channelCache, cacheKey, channelName);
      return channelName;
    } catch (error) {
      this.logger.warn(`Failed to fetch channel ${channelId}:`, getErrorMessage(error));
      return `Channel-${channelId.slice(0, 6)}`;
    }
  }

  /**
   * 여러 유저명을 일괄 조회 (성능 최적화)
   */
  async getUserNames(guildId: string, userIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    for (const userId of userIds) {
      const username = await this.getUserName(guildId, userId);
      result.set(userId, username);
    }

    return result;
  }

  /**
   * 여러 채널명을 일괄 조회
   */
  async getChannelNames(guildId: string, channelIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    for (const channelId of channelIds) {
      const channelName = await this.getChannelName(guildId, channelId);
      result.set(channelId, channelName);
    }

    return result;
  }

  /**
   * 캐시 클리어 (필요한 경우)
   */
  clearCache() {
    this.userCache.clear();
    this.channelCache.clear();
    this.logger.log('Discord gateway cache cleared');
  }

  /**
   * 특정 길드의 캐시만 클리어
   */
  clearGuildCache(guildId: string) {
    // 해당 길드의 유저/채널 캐시 제거
    for (const key of this.userCache.keys()) {
      if (key.startsWith(`${guildId}:`)) {
        this.userCache.delete(key);
      }
    }
    for (const key of this.channelCache.keys()) {
      if (key.startsWith(`${guildId}:`)) {
        this.channelCache.delete(key);
      }
    }

    this.logger.log(`Cleared cache for guild ${guildId}`);
  }
}
