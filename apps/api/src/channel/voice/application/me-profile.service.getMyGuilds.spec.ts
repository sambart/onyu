import type { Repository } from 'typeorm';
import type { Mocked } from 'vitest';

import type { DiscordRestService } from '../../../discord-rest/discord-rest.service';
import type { BadgeQueryService } from '../../../voice-analytics/self-diagnosis/application/badge-query.service';
import type { VoiceDailyOrm } from '../infrastructure/voice-daily.orm-entity';
import { MeProfileService } from './me-profile.service';
import type { VoiceDailyFlushService } from './voice-daily-flush-service';
import type { VoiceExcludedChannelService } from './voice-excluded-channel.service';

function makeQb(rawManyValue?: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getRawOne: vi.fn().mockResolvedValue(null),
    getRawMany: vi.fn().mockResolvedValue(rawManyValue ?? []),
  };
}

describe('MeProfileService', () => {
  let service: MeProfileService;
  let voiceDailyRepo: Mocked<Repository<VoiceDailyOrm>>;
  let flushService: Mocked<VoiceDailyFlushService>;
  let badgeQueryService: Mocked<BadgeQueryService>;
  let excludedChannelService: Mocked<VoiceExcludedChannelService>;
  let discordRestService: Mocked<DiscordRestService>;

  beforeEach(() => {
    voiceDailyRepo = {
      createQueryBuilder: vi.fn(),
      query: vi.fn(),
    } as unknown as Mocked<Repository<VoiceDailyOrm>>;

    flushService = {
      safeFlushAll: vi.fn().mockResolvedValue({ flushed: 0, skipped: 0 }),
    } as unknown as Mocked<VoiceDailyFlushService>;

    badgeQueryService = {
      findBadgeCodes: vi.fn().mockResolvedValue([]),
    } as unknown as Mocked<BadgeQueryService>;

    excludedChannelService = {
      getExcludedChannels: vi.fn().mockResolvedValue([]),
    } as unknown as Mocked<VoiceExcludedChannelService>;

    discordRestService = {
      fetchGuild: vi.fn(),
      fetchGuildChannels: vi.fn().mockResolvedValue([]),
    } as unknown as Mocked<DiscordRestService>;

    service = new MeProfileService(
      voiceDailyRepo,
      flushService,
      badgeQueryService,
      excludedChannelService,
      discordRestService,
    );
  });

  describe('getMyGuilds', () => {
    it('활동 기록이 없는 userId는 빈 배열을 반환한다', async () => {
      voiceDailyRepo.createQueryBuilder.mockReturnValue(
        makeQb([]) as ReturnType<typeof voiceDailyRepo.createQueryBuilder>,
      );

      const result = await service.getMyGuilds('user-no-activity');

      expect(result).toEqual([]);
    });

    it('voice_daily에서 DISTINCT guildId를 조회하여 각 길드를 반환한다', async () => {
      voiceDailyRepo.createQueryBuilder.mockReturnValue(
        makeQb([{ guildId: 'guild-1' }, { guildId: 'guild-2' }]) as ReturnType<
          typeof voiceDailyRepo.createQueryBuilder
        >,
      );
      discordRestService.fetchGuild.mockImplementation(async (guildId: string) => ({
        id: guildId,
        name: `서버 ${guildId}`,
        icon: 'abc123',
      }));

      const result = await service.getMyGuilds('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].guildId).toBe('guild-1');
      expect(result[1].guildId).toBe('guild-2');
    });

    it('Discord REST 성공 시 guildName과 guildIcon을 보강하여 반환한다', async () => {
      voiceDailyRepo.createQueryBuilder.mockReturnValue(
        makeQb([{ guildId: 'guild-123' }]) as ReturnType<typeof voiceDailyRepo.createQueryBuilder>,
      );
      discordRestService.fetchGuild.mockResolvedValue({
        id: 'guild-123',
        name: 'Onyu 서버',
        icon: 'iconhash456',
      });

      const result = await service.getMyGuilds('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].guildId).toBe('guild-123');
      expect(result[0].guildName).toBe('Onyu 서버');
      expect(result[0].guildIcon).toBe(
        'https://cdn.discordapp.com/icons/guild-123/iconhash456.png',
      );
    });

    it('Discord REST 실패(null 반환) 시 guildName과 guildIcon을 null로 폴백한다', async () => {
      voiceDailyRepo.createQueryBuilder.mockReturnValue(
        makeQb([{ guildId: 'guild-fail' }]) as ReturnType<typeof voiceDailyRepo.createQueryBuilder>,
      );
      discordRestService.fetchGuild.mockResolvedValue(null);

      const result = await service.getMyGuilds('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].guildId).toBe('guild-fail');
      expect(result[0].guildName).toBeNull();
      expect(result[0].guildIcon).toBeNull();
    });

    it('길드에 icon이 없으면(icon=null) guildIcon을 null로 반환한다', async () => {
      voiceDailyRepo.createQueryBuilder.mockReturnValue(
        makeQb([{ guildId: 'guild-noicon' }]) as ReturnType<
          typeof voiceDailyRepo.createQueryBuilder
        >,
      );
      discordRestService.fetchGuild.mockResolvedValue({
        id: 'guild-noicon',
        name: '아이콘 없는 서버',
        icon: null,
      });

      const result = await service.getMyGuilds('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].guildName).toBe('아이콘 없는 서버');
      expect(result[0].guildIcon).toBeNull();
    });

    it('여러 길드에 대해 Discord REST를 병렬로 호출한다', async () => {
      const guildIds = ['guild-a', 'guild-b', 'guild-c'];
      voiceDailyRepo.createQueryBuilder.mockReturnValue(
        makeQb(guildIds.map((guildId) => ({ guildId }))) as ReturnType<
          typeof voiceDailyRepo.createQueryBuilder
        >,
      );

      const fetchCallOrder: string[] = [];
      discordRestService.fetchGuild.mockImplementation(async (guildId: string) => {
        fetchCallOrder.push(guildId);
        return { id: guildId, name: `서버 ${guildId}`, icon: null };
      });

      const result = await service.getMyGuilds('user-1');

      expect(result).toHaveLength(3);
      // Promise.all로 병렬 호출되므로 fetchGuild는 3번 호출됨
      expect(discordRestService.fetchGuild).toHaveBeenCalledTimes(3);
      expect(discordRestService.fetchGuild).toHaveBeenCalledWith('guild-a');
      expect(discordRestService.fetchGuild).toHaveBeenCalledWith('guild-b');
      expect(discordRestService.fetchGuild).toHaveBeenCalledWith('guild-c');
    });

    it('QueryBuilder에 userId 조건이 포함되어 본인 데이터만 조회한다', async () => {
      const qb = makeQb([]) as ReturnType<typeof voiceDailyRepo.createQueryBuilder>;
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getMyGuilds('target-user-id');

      // where 절에 userId 파라미터가 전달되는지 검증
      expect(qb.where).toHaveBeenCalledWith(
        expect.stringContaining('userId'),
        expect.objectContaining({ userId: 'target-user-id' }),
      );
    });

    it('각 길드는 MeVoiceGuild 형태(guildId, guildName, guildIcon)로 반환된다', async () => {
      voiceDailyRepo.createQueryBuilder.mockReturnValue(
        makeQb([{ guildId: 'guild-shape-test' }]) as ReturnType<
          typeof voiceDailyRepo.createQueryBuilder
        >,
      );
      discordRestService.fetchGuild.mockResolvedValue({
        id: 'guild-shape-test',
        name: '형태 검증 서버',
        icon: 'hash789',
      });

      const result = await service.getMyGuilds('user-1');

      expect(result[0]).toMatchObject({
        guildId: expect.any(String),
        guildName: expect.any(String),
        guildIcon: expect.any(String),
      });
    });
  });
});
