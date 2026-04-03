import type { Repository } from 'typeorm';
import type { Mocked } from 'vitest';

import type { GuildMemberService } from '../../../guild-member/application/guild-member.service';
import type { GuildMemberOrmEntity } from '../../../guild-member/infrastructure/guild-member.orm-entity';
import type { VoiceDailyOrm } from '../infrastructure/voice-daily.orm-entity';
import { MemberSearchService } from './member-search.service';

describe('MemberSearchService', () => {
  let service: MemberSearchService;
  let voiceDailyRepo: Mocked<Repository<VoiceDailyOrm>>;
  let guildMemberService: Mocked<GuildMemberService>;

  // QueryBuilder 체인 mock 헬퍼
  function makeQb(returnValue: unknown) {
    const qb = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue(returnValue),
      getMany: vi.fn().mockResolvedValue(returnValue),
    };
    return qb;
  }

  function makeGuildMember(overrides: Partial<GuildMemberOrmEntity> = {}): GuildMemberOrmEntity {
    return {
      id: 1,
      guildId: 'guild-1',
      userId: 'user-1',
      displayName: 'Alice',
      username: 'alice',
      nick: null,
      avatarUrl: null,
      isBot: false,
      joinedAt: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as GuildMemberOrmEntity;
  }

  beforeEach(() => {
    voiceDailyRepo = {
      createQueryBuilder: vi.fn(),
    } as unknown as Mocked<Repository<VoiceDailyOrm>>;

    guildMemberService = {
      findByUserId: vi.fn(),
      findByUserIds: vi.fn(),
    } as unknown as Mocked<GuildMemberService>;

    service = new MemberSearchService(voiceDailyRepo, guildMemberService);
  });

  describe('search', () => {
    it('ILIKE 검색으로 userName에 쿼리가 포함된 사용자를 반환한다', async () => {
      const rows = [
        { userId: 'user-1', userName: 'Alice' },
        { userId: 'user-2', userName: 'Alice2' },
      ];
      const qb = makeQb(rows);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(
        qb as ReturnType<typeof voiceDailyRepo.createQueryBuilder>,
      );

      const result = await service.search('guild-1', 'Alice');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ userId: 'user-1', userName: 'Alice' });
      expect(result[1]).toEqual({ userId: 'user-2', userName: 'Alice2' });
    });

    it('결과가 없으면 빈 배열을 반환한다', async () => {
      const qb = makeQb([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(
        qb as ReturnType<typeof voiceDailyRepo.createQueryBuilder>,
      );

      const result = await service.search('guild-1', 'nonexistent');

      expect(result).toEqual([]);
    });

    it('limit 20이 적용된다', async () => {
      const qb = makeQb([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(
        qb as ReturnType<typeof voiceDailyRepo.createQueryBuilder>,
      );

      await service.search('guild-1', 'query');

      expect(qb.limit).toHaveBeenCalledWith(20);
    });

    it('ILIKE 검색 시 쿼리 앞뒤에 %가 붙는다', async () => {
      const qb = makeQb([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(
        qb as ReturnType<typeof voiceDailyRepo.createQueryBuilder>,
      );

      await service.search('guild-1', 'abc');

      expect(qb.andWhere).toHaveBeenCalledWith('vd."userName" ILIKE :q', { q: '%abc%' });
    });

    it('guildId 필터가 적용된다', async () => {
      const qb = makeQb([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(
        qb as ReturnType<typeof voiceDailyRepo.createQueryBuilder>,
      );

      await service.search('guild-999', 'test');

      expect(qb.where).toHaveBeenCalledWith('vd."guildId" = :guildId', { guildId: 'guild-999' });
    });
  });

  describe('getProfile', () => {
    it('존재하는 userId로 프로필을 반환한다', async () => {
      guildMemberService.findByUserId.mockResolvedValue(
        makeGuildMember({
          userId: 'user-1',
          displayName: 'Alice',
          avatarUrl: 'https://cdn.discord.com/avatar.png',
        }),
      );

      const result = await service.getProfile('guild-1', 'user-1');

      expect(result).toEqual({
        userId: 'user-1',
        userName: 'Alice',
        avatarUrl: 'https://cdn.discord.com/avatar.png',
      });
    });

    it('존재하지 않는 userId이면 null을 반환한다', async () => {
      guildMemberService.findByUserId.mockResolvedValue(null);

      const result = await service.getProfile('guild-1', 'no-exist');

      expect(result).toBeNull();
    });

    it('avatarUrl이 없으면 null을 반환한다', async () => {
      guildMemberService.findByUserId.mockResolvedValue(
        makeGuildMember({ userId: 'user-1', displayName: 'Bob', avatarUrl: null }),
      );

      const result = await service.getProfile('guild-1', 'user-1');

      expect(result?.avatarUrl).toBeNull();
    });
  });

  describe('getProfiles', () => {
    it('userIds 배열에 해당하는 멤버 프로필 맵을 반환한다', async () => {
      const memberMap = new Map<string, GuildMemberOrmEntity>([
        [
          'user-1',
          makeGuildMember({ userId: 'user-1', displayName: 'Alice', avatarUrl: 'avatar-1' }),
        ],
        ['user-2', makeGuildMember({ userId: 'user-2', displayName: 'Bob', avatarUrl: null })],
      ]);
      guildMemberService.findByUserIds.mockResolvedValue(memberMap);

      const result = await service.getProfiles('guild-1', ['user-1', 'user-2']);

      expect(result['user-1']).toEqual({ userName: 'Alice', avatarUrl: 'avatar-1' });
      expect(result['user-2']).toEqual({ userName: 'Bob', avatarUrl: null });
    });

    it('빈 배열을 전달하면 즉시 빈 객체를 반환한다 (DB 쿼리 없음)', async () => {
      const result = await service.getProfiles('guild-1', []);

      expect(result).toEqual({});
      expect(guildMemberService.findByUserIds).not.toHaveBeenCalled();
    });
  });
});
