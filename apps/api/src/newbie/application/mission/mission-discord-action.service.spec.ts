import { type Mock } from 'vitest';

import type { GuildMemberOrmEntity } from '../../../guild-member/infrastructure/guild-member.orm-entity';
import { MissionDiscordActionService } from './mission-discord-action.service';

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

describe('MissionDiscordActionService', () => {
  let service: MissionDiscordActionService;
  let discordRest: {
    addMemberRole: Mock;
    sendDM: Mock;
    kickMember: Mock;
  };
  let guildMemberService: {
    findByUserId: Mock;
    findActiveMembersExcludingBots: Mock;
  };

  beforeEach(() => {
    discordRest = {
      addMemberRole: vi.fn(),
      sendDM: vi.fn(),
      kickMember: vi.fn(),
    };

    guildMemberService = {
      findByUserId: vi.fn(),
      findActiveMembersExcludingBots: vi.fn(),
    };

    service = new MissionDiscordActionService(discordRest as never, guildMemberService as never);
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────
  // grantRole
  // ──────────────────────────────────────────────────────
  describe('grantRole', () => {
    it('역할 부여 성공 시 undefined 반환', async () => {
      discordRest.addMemberRole.mockResolvedValue(undefined);

      const result = await service.grantRole('guild-1', 'user-1', 'role-1');

      expect(result).toBeUndefined();
      expect(discordRest.addMemberRole).toHaveBeenCalledWith('guild-1', 'user-1', 'role-1');
    });

    it('역할 부여 실패 시 warning 문자열 반환 (throw 없음)', async () => {
      discordRest.addMemberRole.mockRejectedValue(new Error('권한 없음'));

      const result = await service.grantRole('guild-1', 'user-1', 'role-1');

      expect(typeof result).toBe('string');
      expect(result).toContain('역할 부여에 실패했습니다');
    });
  });

  // ──────────────────────────────────────────────────────
  // sendDmAndKick
  // ──────────────────────────────────────────────────────
  describe('sendDmAndKick', () => {
    it('DM 전송 후 강퇴 성공 시 undefined 반환', async () => {
      discordRest.sendDM.mockResolvedValue(undefined);
      discordRest.kickMember.mockResolvedValue(undefined);

      const result = await service.sendDmAndKick('guild-1', 'user-1', '강퇴 사유');

      expect(discordRest.sendDM).toHaveBeenCalledWith('user-1', '강퇴 사유');
      expect(discordRest.kickMember).toHaveBeenCalledWith('guild-1', 'user-1', '미션 실패 처리');
      expect(result).toBeUndefined();
    });

    it('DM 실패해도 강퇴는 계속 진행된다', async () => {
      discordRest.sendDM.mockRejectedValue(new Error('DM 차단됨'));
      discordRest.kickMember.mockResolvedValue(undefined);

      const result = await service.sendDmAndKick('guild-1', 'user-1', '강퇴 사유');

      expect(discordRest.kickMember).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('dmReason이 null이면 DM 전송하지 않는다', async () => {
      discordRest.kickMember.mockResolvedValue(undefined);

      await service.sendDmAndKick('guild-1', 'user-1', null);

      expect(discordRest.sendDM).not.toHaveBeenCalled();
      expect(discordRest.kickMember).toHaveBeenCalled();
    });

    it('dmReason이 undefined이면 DM 전송하지 않는다', async () => {
      discordRest.kickMember.mockResolvedValue(undefined);

      await service.sendDmAndKick('guild-1', 'user-1');

      expect(discordRest.sendDM).not.toHaveBeenCalled();
    });

    it('강퇴 실패 시 warning 문자열 반환 (throw 없음)', async () => {
      discordRest.sendDM.mockResolvedValue(undefined);
      discordRest.kickMember.mockRejectedValue(new Error('강퇴 권한 없음'));

      const result = await service.sendDmAndKick('guild-1', 'user-1', '사유');

      expect(typeof result).toBe('string');
      expect(result).toContain('강퇴에 실패했습니다');
    });
  });

  // ──────────────────────────────────────────────────────
  // checkMemberExists (DB 기반 — F-GUILD-MEMBER-009 전환 후)
  // ──────────────────────────────────────────────────────
  describe('checkMemberExists', () => {
    it('DB에 존재하고 isActive=true이면 { member, isConfirmedAbsent: false } 반환', async () => {
      const member = makeGuildMember({ isActive: true });
      guildMemberService.findByUserId.mockResolvedValue(member);

      const result = await service.checkMemberExists('guild-1', 'user-1');

      expect(result.member).toBe(member);
      expect(result.isConfirmedAbsent).toBe(false);
    });

    it('DB에 없으면(null) 판단 불가 → { member: null, isConfirmedAbsent: false }', async () => {
      guildMemberService.findByUserId.mockResolvedValue(null);

      const result = await service.checkMemberExists('guild-1', 'user-1');

      expect(result.member).toBeNull();
      expect(result.isConfirmedAbsent).toBe(false);
    });

    it('DB에 있고 isActive=false이면 탈퇴 확정 → { member: null, isConfirmedAbsent: true }', async () => {
      const member = makeGuildMember({ isActive: false });
      guildMemberService.findByUserId.mockResolvedValue(member);

      const result = await service.checkMemberExists('guild-1', 'user-1');

      expect(result.member).toBeNull();
      expect(result.isConfirmedAbsent).toBe(true);
    });

    it('guildMemberService.findByUserId를 올바른 인자로 호출한다', async () => {
      guildMemberService.findByUserId.mockResolvedValue(null);

      await service.checkMemberExists('guild-99', 'user-99');

      expect(guildMemberService.findByUserId).toHaveBeenCalledWith('guild-99', 'user-99');
    });
  });

  // ──────────────────────────────────────────────────────
  // fetchMemberDisplayName (DB 기반 — F-GUILD-MEMBER-009 전환 후)
  // ──────────────────────────────────────────────────────
  describe('fetchMemberDisplayName', () => {
    it('DB에 멤버가 있으면 displayName을 반환한다', async () => {
      const member = makeGuildMember({ displayName: '동현' });
      guildMemberService.findByUserId.mockResolvedValue(member);

      const result = await service.fetchMemberDisplayName('guild-1', 'user-1');

      expect(result).toBe('동현');
    });

    it('DB에 멤버가 없으면(null) null을 반환한다', async () => {
      guildMemberService.findByUserId.mockResolvedValue(null);

      const result = await service.fetchMemberDisplayName('guild-1', 'user-1');

      expect(result).toBeNull();
    });

    it('guildMemberService.findByUserId를 올바른 인자로 호출한다', async () => {
      guildMemberService.findByUserId.mockResolvedValue(null);

      await service.fetchMemberDisplayName('guild-99', 'user-99');

      expect(guildMemberService.findByUserId).toHaveBeenCalledWith('guild-99', 'user-99');
    });
  });

  // ──────────────────────────────────────────────────────
  // fetchGuildMembers (DB 기반 — F-GUILD-MEMBER-009 전환 후)
  // ──────────────────────────────────────────────────────
  describe('fetchGuildMembers', () => {
    it('활성 비봇 멤버 목록을 반환한다', async () => {
      const members = [
        makeGuildMember({ userId: 'user-1', isBot: false, isActive: true }),
        makeGuildMember({ id: 2, userId: 'user-2', isBot: false, isActive: true }),
      ];
      guildMemberService.findActiveMembersExcludingBots.mockResolvedValue(members);

      const result = await service.fetchGuildMembers('guild-1');

      expect(result).toBe(members);
      expect(guildMemberService.findActiveMembersExcludingBots).toHaveBeenCalledWith('guild-1');
    });

    it('조회 실패 시 null을 반환한다 (throw 없음)', async () => {
      guildMemberService.findActiveMembersExcludingBots.mockRejectedValue(new Error('DB 오류'));

      const result = await service.fetchGuildMembers('guild-1');

      expect(result).toBeNull();
    });

    it('빈 길드이면 빈 배열을 반환한다', async () => {
      guildMemberService.findActiveMembersExcludingBots.mockResolvedValue([]);

      const result = await service.fetchGuildMembers('guild-1');

      expect(result).toEqual([]);
    });
  });
});
