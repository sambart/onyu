import { type Mock } from 'vitest';

import type { GuildMemberOrmEntity } from '../infrastructure/guild-member.orm-entity';
import type { BulkUpsertMemberData } from '../infrastructure/guild-member.repository';
import { GuildMemberService } from './guild-member.service';

function makeGuildMember(overrides: Partial<GuildMemberOrmEntity> = {}): GuildMemberOrmEntity {
  return {
    id: 1,
    guildId: 'guild-1',
    userId: 'user-1',
    displayName: '동현',
    username: 'donghyun',
    nick: null,
    avatarUrl: null,
    isBot: false,
    joinedAt: new Date('2026-01-01'),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as GuildMemberOrmEntity;
}

function makeBulkData(overrides: Partial<BulkUpsertMemberData> = {}): BulkUpsertMemberData {
  return {
    userId: 'user-1',
    displayName: '동현',
    username: 'donghyun',
    isBot: false,
    ...overrides,
  };
}

describe('GuildMemberService', () => {
  let service: GuildMemberService;
  let repo: {
    upsert: Mock;
    bulkUpsert: Mock;
    deactivate: Mock;
    updateDisplayName: Mock;
    updateGlobalProfile: Mock;
    findByGuildAndUser: Mock;
    findByGuildAndUsers: Mock;
    findActiveMembers: Mock;
    findActiveMembersExcludingBots: Mock;
    findByJoinedAfter: Mock;
  };

  beforeEach(() => {
    repo = {
      upsert: vi.fn(),
      bulkUpsert: vi.fn(),
      deactivate: vi.fn(),
      updateDisplayName: vi.fn(),
      updateGlobalProfile: vi.fn(),
      findByGuildAndUser: vi.fn(),
      findByGuildAndUsers: vi.fn(),
      findActiveMembers: vi.fn(),
      findActiveMembersExcludingBots: vi.fn(),
      findByJoinedAfter: vi.fn(),
    };

    service = new GuildMemberService(repo as never);
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────
  // upsertMember
  // ──────────────────────────────────────────────────────
  describe('upsertMember', () => {
    it('repository.upsert를 guildId와 data로 호출한다', async () => {
      repo.upsert.mockResolvedValue(undefined);
      const data = makeBulkData();

      await service.upsertMember('guild-1', data);

      expect(repo.upsert).toHaveBeenCalledWith('guild-1', data);
      expect(repo.upsert).toHaveBeenCalledTimes(1);
    });

    it('성공 시 void를 반환한다', async () => {
      repo.upsert.mockResolvedValue(undefined);

      const result = await service.upsertMember('guild-1', makeBulkData());

      expect(result).toBeUndefined();
    });

    it('repository.upsert 실패 시 에러를 throw한다', async () => {
      const error = new Error('DB 연결 실패');
      repo.upsert.mockRejectedValue(error);

      await expect(service.upsertMember('guild-1', makeBulkData())).rejects.toThrow('DB 연결 실패');
    });

    it('nick, avatarUrl, joinedAt이 있는 데이터도 정상 처리된다', async () => {
      repo.upsert.mockResolvedValue(undefined);
      const data = makeBulkData({
        nick: '서버닉네임',
        avatarUrl: 'https://cdn.discord.com/avatar.png',
        joinedAt: '2026-01-01T00:00:00.000Z',
      });

      await service.upsertMember('guild-2', data);

      expect(repo.upsert).toHaveBeenCalledWith('guild-2', data);
    });
  });

  // ──────────────────────────────────────────────────────
  // bulkUpsertMembers
  // ──────────────────────────────────────────────────────
  describe('bulkUpsertMembers', () => {
    it('members가 있으면 repository.bulkUpsert를 호출한다', async () => {
      repo.bulkUpsert.mockResolvedValue(undefined);
      const members = [makeBulkData(), makeBulkData({ userId: 'user-2', displayName: '유저2' })];

      await service.bulkUpsertMembers('guild-1', members);

      expect(repo.bulkUpsert).toHaveBeenCalledWith('guild-1', members);
      expect(repo.bulkUpsert).toHaveBeenCalledTimes(1);
    });

    it('빈 배열이면 repository.bulkUpsert를 호출하지 않는다 (early return)', async () => {
      await service.bulkUpsertMembers('guild-1', []);

      expect(repo.bulkUpsert).not.toHaveBeenCalled();
    });

    it('빈 배열이면 void를 반환한다', async () => {
      const result = await service.bulkUpsertMembers('guild-1', []);

      expect(result).toBeUndefined();
    });

    it('repository.bulkUpsert 실패 시 에러를 throw한다', async () => {
      const error = new Error('bulk insert 실패');
      repo.bulkUpsert.mockRejectedValue(error);

      await expect(service.bulkUpsertMembers('guild-1', [makeBulkData()])).rejects.toThrow(
        'bulk insert 실패',
      );
    });

    it('1명짜리 배열도 정상적으로 upsert한다', async () => {
      repo.bulkUpsert.mockResolvedValue(undefined);
      const members = [makeBulkData()];

      await service.bulkUpsertMembers('guild-1', members);

      expect(repo.bulkUpsert).toHaveBeenCalledWith('guild-1', members);
    });
  });

  // ──────────────────────────────────────────────────────
  // deactivateMember
  // ──────────────────────────────────────────────────────
  describe('deactivateMember', () => {
    it('repository.deactivate를 guildId, userId로 호출한다', async () => {
      repo.deactivate.mockResolvedValue(undefined);

      await service.deactivateMember('guild-1', 'user-1');

      expect(repo.deactivate).toHaveBeenCalledWith('guild-1', 'user-1');
      expect(repo.deactivate).toHaveBeenCalledTimes(1);
    });

    it('성공 시 void를 반환한다', async () => {
      repo.deactivate.mockResolvedValue(undefined);

      const result = await service.deactivateMember('guild-1', 'user-1');

      expect(result).toBeUndefined();
    });

    it('repository.deactivate 실패 시 에러를 throw한다', async () => {
      const error = new Error('UPDATE 실패');
      repo.deactivate.mockRejectedValue(error);

      await expect(service.deactivateMember('guild-1', 'user-1')).rejects.toThrow('UPDATE 실패');
    });
  });

  // ──────────────────────────────────────────────────────
  // updateDisplayName
  // ──────────────────────────────────────────────────────
  describe('updateDisplayName', () => {
    it('repository.updateDisplayName을 올바른 인자로 호출한다', async () => {
      repo.updateDisplayName.mockResolvedValue(undefined);

      await service.updateDisplayName('guild-1', 'user-1', '새닉네임', '서버닉', null);

      expect(repo.updateDisplayName).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        '새닉네임',
        '서버닉',
        null,
      );
    });

    it('nick=null, avatarUrl=null인 경우에도 정상 호출된다', async () => {
      repo.updateDisplayName.mockResolvedValue(undefined);

      await service.updateDisplayName('guild-1', 'user-1', '닉네임', null, null);

      expect(repo.updateDisplayName).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        '닉네임',
        null,
        null,
      );
    });

    it('성공 시 void를 반환한다', async () => {
      repo.updateDisplayName.mockResolvedValue(undefined);

      const result = await service.updateDisplayName('guild-1', 'user-1', '닉네임', null, null);

      expect(result).toBeUndefined();
    });

    it('repository.updateDisplayName 실패 시 에러를 throw한다', async () => {
      repo.updateDisplayName.mockRejectedValue(new Error('UPDATE 오류'));

      await expect(
        service.updateDisplayName('guild-1', 'user-1', '닉네임', null, null),
      ).rejects.toThrow('UPDATE 오류');
    });
  });

  // ──────────────────────────────────────────────────────
  // updateGlobalProfile
  // ──────────────────────────────────────────────────────
  describe('updateGlobalProfile', () => {
    it('repository.updateGlobalProfile을 userId, displayName, username으로 호출한다', async () => {
      repo.updateGlobalProfile.mockResolvedValue(undefined);

      await service.updateGlobalProfile('user-1', '글로벌닉네임', 'globalusername');

      expect(repo.updateGlobalProfile).toHaveBeenCalledWith(
        'user-1',
        '글로벌닉네임',
        'globalusername',
      );
    });

    it('성공 시 void를 반환한다', async () => {
      repo.updateGlobalProfile.mockResolvedValue(undefined);

      const result = await service.updateGlobalProfile('user-1', '닉네임', 'username');

      expect(result).toBeUndefined();
    });

    it('repository.updateGlobalProfile 실패 시 에러를 throw한다', async () => {
      repo.updateGlobalProfile.mockRejectedValue(new Error('전역 프로필 갱신 실패'));

      await expect(service.updateGlobalProfile('user-1', '닉네임', 'username')).rejects.toThrow(
        '전역 프로필 갱신 실패',
      );
    });
  });

  // ──────────────────────────────────────────────────────
  // findByUserId
  // ──────────────────────────────────────────────────────
  describe('findByUserId', () => {
    it('존재하는 멤버이면 GuildMemberOrmEntity를 반환한다', async () => {
      const member = makeGuildMember();
      repo.findByGuildAndUser.mockResolvedValue(member);

      const result = await service.findByUserId('guild-1', 'user-1');

      expect(result).toBe(member);
      expect(repo.findByGuildAndUser).toHaveBeenCalledWith('guild-1', 'user-1');
    });

    it('존재하지 않는 멤버이면 null을 반환한다', async () => {
      repo.findByGuildAndUser.mockResolvedValue(null);

      const result = await service.findByUserId('guild-1', 'no-exist');

      expect(result).toBeNull();
    });

    it('isActive=false인 멤버도 그대로 반환한다 (소비자가 필터링)', async () => {
      const member = makeGuildMember({ isActive: false });
      repo.findByGuildAndUser.mockResolvedValue(member);

      const result = await service.findByUserId('guild-1', 'user-1');

      expect(result?.isActive).toBe(false);
    });

    it('isBot=true인 멤버도 그대로 반환한다', async () => {
      const member = makeGuildMember({ isBot: true });
      repo.findByGuildAndUser.mockResolvedValue(member);

      const result = await service.findByUserId('guild-1', 'user-1');

      expect(result?.isBot).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────
  // findByUserIds
  // ──────────────────────────────────────────────────────
  describe('findByUserIds', () => {
    it('여러 멤버를 Map<userId, GuildMemberOrmEntity>로 반환한다', async () => {
      const members = [
        makeGuildMember({ userId: 'user-1', displayName: '동현' }),
        makeGuildMember({ id: 2, userId: 'user-2', displayName: '유저2' }),
      ];
      repo.findByGuildAndUsers.mockResolvedValue(members);

      const result = await service.findByUserIds('guild-1', ['user-1', 'user-2']);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('user-1')?.displayName).toBe('동현');
      expect(result.get('user-2')?.displayName).toBe('유저2');
    });

    it('빈 결과이면 빈 Map을 반환한다', async () => {
      repo.findByGuildAndUsers.mockResolvedValue([]);

      const result = await service.findByUserIds('guild-1', ['no-exist']);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('빈 배열을 전달해도 repository를 호출한다', async () => {
      repo.findByGuildAndUsers.mockResolvedValue([]);

      const result = await service.findByUserIds('guild-1', []);

      expect(repo.findByGuildAndUsers).toHaveBeenCalledWith('guild-1', []);
      expect(result.size).toBe(0);
    });

    it('Map의 키는 userId이다', async () => {
      const member = makeGuildMember({ userId: 'user-abc', displayName: '테스트' });
      repo.findByGuildAndUsers.mockResolvedValue([member]);

      const result = await service.findByUserIds('guild-1', ['user-abc']);

      expect(result.has('user-abc')).toBe(true);
    });

    it('요청한 userId 중 일부만 DB에 있으면 있는 것만 Map에 포함된다', async () => {
      const member = makeGuildMember({ userId: 'user-1' });
      repo.findByGuildAndUsers.mockResolvedValue([member]);

      const result = await service.findByUserIds('guild-1', ['user-1', 'user-2']);

      expect(result.size).toBe(1);
      expect(result.has('user-1')).toBe(true);
      expect(result.has('user-2')).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────
  // findActiveMembers
  // ──────────────────────────────────────────────────────
  describe('findActiveMembers', () => {
    it('repository.findActiveMembers를 guildId로 호출한다', async () => {
      const members = [makeGuildMember(), makeGuildMember({ id: 2, userId: 'user-2' })];
      repo.findActiveMembers.mockResolvedValue(members);

      const result = await service.findActiveMembers('guild-1');

      expect(repo.findActiveMembers).toHaveBeenCalledWith('guild-1');
      expect(result).toBe(members);
    });

    it('활성 멤버가 없으면 빈 배열을 반환한다', async () => {
      repo.findActiveMembers.mockResolvedValue([]);

      const result = await service.findActiveMembers('guild-1');

      expect(result).toEqual([]);
    });

    it('반환된 멤버들은 모두 isActive=true이다', async () => {
      const members = [
        makeGuildMember({ isActive: true }),
        makeGuildMember({ id: 2, userId: 'user-2', isActive: true }),
      ];
      repo.findActiveMembers.mockResolvedValue(members);

      const result = await service.findActiveMembers('guild-1');

      expect(result.every((m) => m.isActive)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────
  // findActiveMembersExcludingBots
  // ──────────────────────────────────────────────────────
  describe('findActiveMembersExcludingBots', () => {
    it('repository.findActiveMembersExcludingBots를 guildId로 호출한다', async () => {
      const members = [makeGuildMember({ isBot: false })];
      repo.findActiveMembersExcludingBots.mockResolvedValue(members);

      const result = await service.findActiveMembersExcludingBots('guild-1');

      expect(repo.findActiveMembersExcludingBots).toHaveBeenCalledWith('guild-1');
      expect(result).toBe(members);
    });

    it('봇이 없는 길드에서는 빈 배열을 반환한다', async () => {
      repo.findActiveMembersExcludingBots.mockResolvedValue([]);

      const result = await service.findActiveMembersExcludingBots('guild-1');

      expect(result).toEqual([]);
    });

    it('반환된 멤버들은 모두 isBot=false이다', async () => {
      const members = [
        makeGuildMember({ isBot: false }),
        makeGuildMember({ id: 2, userId: 'user-2', isBot: false }),
      ];
      repo.findActiveMembersExcludingBots.mockResolvedValue(members);

      const result = await service.findActiveMembersExcludingBots('guild-1');

      expect(result.every((m) => !m.isBot)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────
  // findByJoinedAfter
  // ──────────────────────────────────────────────────────
  describe('findByJoinedAfter', () => {
    it('repository.findByJoinedAfter를 guildId와 date로 호출한다', async () => {
      const cutoffDate = new Date('2026-01-01');
      const members = [makeGuildMember({ joinedAt: new Date('2026-01-02') })];
      repo.findByJoinedAfter.mockResolvedValue(members);

      const result = await service.findByJoinedAfter('guild-1', cutoffDate);

      expect(repo.findByJoinedAfter).toHaveBeenCalledWith('guild-1', cutoffDate);
      expect(result).toBe(members);
    });

    it('cutoff 이후 가입 멤버가 없으면 빈 배열을 반환한다', async () => {
      repo.findByJoinedAfter.mockResolvedValue([]);

      const result = await service.findByJoinedAfter('guild-1', new Date('2099-01-01'));

      expect(result).toEqual([]);
    });

    it('반환된 멤버들의 joinedAt은 date 이후이다', async () => {
      const cutoff = new Date('2026-01-01');
      const members = [
        makeGuildMember({ joinedAt: new Date('2026-01-02') }),
        makeGuildMember({ id: 2, userId: 'user-2', joinedAt: new Date('2026-03-15') }),
      ];
      repo.findByJoinedAfter.mockResolvedValue(members);

      const result = await service.findByJoinedAfter('guild-1', cutoff);

      expect(result.every((m) => m.joinedAt && m.joinedAt >= cutoff)).toBe(true);
    });
  });
});
