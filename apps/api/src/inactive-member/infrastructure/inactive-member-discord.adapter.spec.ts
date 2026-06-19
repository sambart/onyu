/**
 * InactiveMemberDiscordAdapter 단위 테스트
 *
 * Discord API 호출(역할 부여/제거, DM 발송, kick, 멤버 조회)을 DiscordRestService
 * 를 mock 하여 검증한다.
 *
 * 핵심 시나리오:
 * - 각 연산(kick / DM / modifyRole / fetchGuildMembers)의 정상 동작
 * - 개별 실패 시 예외를 삼키지 않고 false/null 을 반환하는 부분 실패 집계 동작
 * - fetchGuildMembers 의 재시도 로직 (rate-limit 포함)
 */

import { Logger } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InactiveMemberDiscordAdapter } from './inactive-member-discord.adapter';

// ──────────────────────────────────────────────────────────────────────────────
// DiscordRestService mock 팩토리
// ──────────────────────────────────────────────────────────────────────────────

function makeDiscordRest() {
  return {
    fetchGuild: vi.fn(),
    fetchAllGuildMembers: vi.fn(),
    kickMember: vi.fn(),
    sendDMEmbed: vi.fn(),
    addMemberRole: vi.fn(),
    removeMemberRole: vi.fn(),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 헬퍼
// ──────────────────────────────────────────────────────────────────────────────

/** 최소 EmbedBuilder 인스턴스를 생성한다 */
function makeEmbed(): EmbedBuilder {
  return new EmbedBuilder().setTitle('테스트 임베드');
}

/** Error 메시지에 Retry after 정보를 담은 Rate-limit 에러를 생성한다 */
function makeRateLimitError(retryAfterSec: number): Error {
  return new Error(`Retry after ${retryAfterSec}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 테스트 스위트
// ──────────────────────────────────────────────────────────────────────────────

describe('InactiveMemberDiscordAdapter', () => {
  let discordRest: ReturnType<typeof makeDiscordRest>;
  let adapter: InactiveMemberDiscordAdapter;

  beforeEach(() => {
    vi.clearAllMocks();

    // Logger 는 부수 효과만 일으키므로 silence 처리
    vi.spyOn(Logger.prototype, 'warn').mockReturnValue(undefined);
    vi.spyOn(Logger.prototype, 'error').mockReturnValue(undefined);

    discordRest = makeDiscordRest();
    adapter = new InactiveMemberDiscordAdapter(discordRest as never);
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // fetchGuild
  // ──────────────────────────────────────────────────────────────────────────────

  describe('fetchGuild', () => {
    it('discordRest.fetchGuild 결과를 그대로 반환한다', async () => {
      const fakeGuild = { id: 'guild-1', name: '테스트서버' };
      discordRest.fetchGuild.mockResolvedValue(fakeGuild);

      const result = await adapter.fetchGuild('guild-1');

      expect(discordRest.fetchGuild).toHaveBeenCalledWith('guild-1');
      expect(result).toBe(fakeGuild);
    });

    it('길드를 찾을 수 없으면 null 을 반환한다', async () => {
      discordRest.fetchGuild.mockResolvedValue(null);

      const result = await adapter.fetchGuild('guild-1');

      expect(result).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // fetchGuildMembers — 재시도 로직
  // ──────────────────────────────────────────────────────────────────────────────

  describe('fetchGuildMembers', () => {
    it('정상 조회 시 멤버 배열을 반환한다', async () => {
      const members = [{ user: { id: 'u1' } }, { user: { id: 'u2' } }];
      discordRest.fetchAllGuildMembers.mockResolvedValue(members);

      const result = await adapter.fetchGuildMembers('guild-1');

      expect(result).toEqual(members);
      expect(discordRest.fetchAllGuildMembers).toHaveBeenCalledTimes(1);
    });

    it('첫 시도 실패 후 재시도(2차)에서 성공하면 멤버 배열을 반환한다', async () => {
      const members = [{ user: { id: 'u1' } }];
      discordRest.fetchAllGuildMembers
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce(members);

      // sleep 을 즉시 완료하도록 mock
      vi.spyOn(adapter as never, 'sleep').mockResolvedValue(undefined);

      const result = await adapter.fetchGuildMembers('guild-1', 3);

      expect(result).toEqual(members);
      expect(discordRest.fetchAllGuildMembers).toHaveBeenCalledTimes(2);
    });

    it('maxRetries 회 모두 실패하면 null 을 반환한다', async () => {
      discordRest.fetchAllGuildMembers.mockRejectedValue(new Error('network error'));

      vi.spyOn(adapter as never, 'sleep').mockResolvedValue(undefined);

      const result = await adapter.fetchGuildMembers('guild-1', 3);

      expect(result).toBeNull();
      expect(discordRest.fetchAllGuildMembers).toHaveBeenCalledTimes(3);
    });

    it('maxRetries=1 이면 실패 즉시 null 을 반환하고 재시도 없다', async () => {
      discordRest.fetchAllGuildMembers.mockRejectedValue(new Error('error'));

      const result = await adapter.fetchGuildMembers('guild-1', 1);

      expect(result).toBeNull();
      expect(discordRest.fetchAllGuildMembers).toHaveBeenCalledTimes(1);
    });

    it('Rate-limit 에러 발생 시 retry-after 파싱 결과로 sleep 을 호출한다', async () => {
      const rateLimitErr = makeRateLimitError(30); // 30초 → 31_000ms
      discordRest.fetchAllGuildMembers
        .mockRejectedValueOnce(rateLimitErr)
        .mockResolvedValueOnce([]);

      const sleepSpy = vi.spyOn(adapter as never, 'sleep').mockResolvedValue(undefined);

      await adapter.fetchGuildMembers('guild-1', 3);

      expect(sleepSpy).toHaveBeenCalledWith(31_000); // ceil(30 * 1000) + 1000
    });

    it('Retry after 패턴이 없는 에러는 기본 25_000ms 로 sleep 을 호출한다', async () => {
      discordRest.fetchAllGuildMembers
        .mockRejectedValueOnce(new Error('unknown error'))
        .mockResolvedValueOnce([]);

      const sleepSpy = vi.spyOn(adapter as never, 'sleep').mockResolvedValue(undefined);

      await adapter.fetchGuildMembers('guild-1', 3);

      expect(sleepSpy).toHaveBeenCalledWith(25_000);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // kickMember
  // ──────────────────────────────────────────────────────────────────────────────

  describe('kickMember', () => {
    it('kick 성공 시 true 를 반환한다', async () => {
      discordRest.kickMember.mockResolvedValue(undefined);

      const result = await adapter.kickMember('guild-1', 'user-1', '비활동 강퇴');

      expect(result).toBe(true);
      expect(discordRest.kickMember).toHaveBeenCalledWith('guild-1', 'user-1', '비활동 강퇴');
    });

    it('kick 실패(예외) 시 false 를 반환하고 예외를 전파하지 않는다', async () => {
      discordRest.kickMember.mockRejectedValue(new Error('Missing Permissions'));

      const result = await adapter.kickMember('guild-1', 'user-1', '비활동 강퇴');

      expect(result).toBe(false);
    });

    it('여러 멤버 kick 중 일부만 실패해도 나머지는 계속 처리된다(부분 실패)', async () => {
      discordRest.kickMember
        .mockResolvedValueOnce(undefined) // user-1 성공
        .mockRejectedValueOnce(new Error('Missing Permissions')) // user-2 실패
        .mockResolvedValueOnce(undefined); // user-3 성공

      const userIds = ['user-1', 'user-2', 'user-3'];
      const results = await Promise.all(
        userIds.map((id) => adapter.kickMember('guild-1', id, '비활동 강퇴')),
      );

      expect(results).toEqual([true, false, true]);
      expect(discordRest.kickMember).toHaveBeenCalledTimes(3);
    });

    it('kick 실패 시 warn 로그를 남긴다', async () => {
      const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockReturnValue(undefined);
      discordRest.kickMember.mockRejectedValue(new Error('Forbidden'));

      await adapter.kickMember('guild-1', 'user-99', '강퇴');

      expect(warnSpy).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // sendDm
  // ──────────────────────────────────────────────────────────────────────────────

  describe('sendDm', () => {
    it('DM 전송 성공 시 true 를 반환한다', async () => {
      discordRest.sendDMEmbed.mockResolvedValue(true);

      const result = await adapter.sendDm('guild-1', 'user-1', makeEmbed());

      expect(result).toBe(true);
    });

    it('sendDMEmbed 이 false 를 반환하면 그대로 false 를 전달한다', async () => {
      discordRest.sendDMEmbed.mockResolvedValue(false);

      const result = await adapter.sendDm('guild-1', 'user-1', makeEmbed());

      expect(result).toBe(false);
    });

    it('DM 차단/거부(예외) 시 false 를 반환하고 예외를 전파하지 않는다', async () => {
      discordRest.sendDMEmbed.mockRejectedValue(new Error('Cannot send messages to this user'));

      const result = await adapter.sendDm('guild-1', 'user-1', makeEmbed());

      expect(result).toBe(false);
    });

    it('여러 멤버 DM 중 일부 차단(부분 실패) 시 나머지 멤버는 계속 처리된다', async () => {
      discordRest.sendDMEmbed
        .mockResolvedValueOnce(true) // user-1 성공
        .mockRejectedValueOnce(new Error('Cannot send messages to this user')) // user-2 DM 차단
        .mockResolvedValueOnce(true); // user-3 성공

      const userIds = ['user-1', 'user-2', 'user-3'];
      const results = await Promise.all(
        userIds.map((id) => adapter.sendDm('guild-1', id, makeEmbed())),
      );

      expect(results).toEqual([true, false, true]);
      expect(discordRest.sendDMEmbed).toHaveBeenCalledTimes(3);
    });

    it('sendDm 은 userId 와 embed.toJSON() 을 포함한 payload 로 sendDMEmbed 를 호출한다', async () => {
      discordRest.sendDMEmbed.mockResolvedValue(true);
      const embed = makeEmbed();

      await adapter.sendDm('guild-1', 'user-1', embed);

      expect(discordRest.sendDMEmbed).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ embeds: [embed.toJSON()] }),
      );
    });

    it('DM 실패 시 warn 로그를 남긴다', async () => {
      const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockReturnValue(undefined);
      discordRest.sendDMEmbed.mockRejectedValue(new Error('DM failed'));

      await adapter.sendDm('guild-1', 'user-99', makeEmbed());

      expect(warnSpy).toHaveBeenCalled();
    });

    it('전체 멤버 DM 실패(전체 실패) 시 모두 false 를 반환한다', async () => {
      discordRest.sendDMEmbed.mockRejectedValue(new Error('Cannot send messages to this user'));

      const userIds = ['user-1', 'user-2', 'user-3'];
      const results = await Promise.all(
        userIds.map((id) => adapter.sendDm('guild-1', id, makeEmbed())),
      );

      expect(results).toEqual([false, false, false]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // modifyRole
  // ──────────────────────────────────────────────────────────────────────────────

  describe('modifyRole', () => {
    describe('add 액션', () => {
      it('역할 부여 성공 시 true 를 반환한다', async () => {
        discordRest.addMemberRole.mockResolvedValue(undefined);

        const result = await adapter.modifyRole('guild-1', 'user-1', 'role-1', 'add');

        expect(result).toBe(true);
        expect(discordRest.addMemberRole).toHaveBeenCalledWith('guild-1', 'user-1', 'role-1');
        expect(discordRest.removeMemberRole).not.toHaveBeenCalled();
      });

      it('역할 부여 실패(권한 부족) 시 false 를 반환하고 예외를 전파하지 않는다', async () => {
        discordRest.addMemberRole.mockRejectedValue(new Error('Missing Permissions'));

        const result = await adapter.modifyRole('guild-1', 'user-1', 'role-1', 'add');

        expect(result).toBe(false);
      });

      it('여러 멤버 역할 부여 중 일부 실패(부분 실패) 시 나머지는 계속 처리된다', async () => {
        discordRest.addMemberRole
          .mockResolvedValueOnce(undefined) // user-1 성공
          .mockRejectedValueOnce(new Error('Missing Permissions')) // user-2 실패
          .mockResolvedValueOnce(undefined); // user-3 성공

        const userIds = ['user-1', 'user-2', 'user-3'];
        const results = await Promise.all(
          userIds.map((id) => adapter.modifyRole('guild-1', id, 'role-1', 'add')),
        );

        expect(results).toEqual([true, false, true]);
        expect(discordRest.addMemberRole).toHaveBeenCalledTimes(3);
      });

      it('전체 역할 부여 실패(전체 실패) 시 모두 false 를 반환한다', async () => {
        discordRest.addMemberRole.mockRejectedValue(new Error('Missing Permissions'));

        const userIds = ['user-1', 'user-2'];
        const results = await Promise.all(
          userIds.map((id) => adapter.modifyRole('guild-1', id, 'role-1', 'add')),
        );

        expect(results).toEqual([false, false]);
      });
    });

    describe('remove 액션', () => {
      it('역할 제거 성공 시 true 를 반환한다', async () => {
        discordRest.removeMemberRole.mockResolvedValue(undefined);

        const result = await adapter.modifyRole('guild-1', 'user-1', 'role-1', 'remove');

        expect(result).toBe(true);
        expect(discordRest.removeMemberRole).toHaveBeenCalledWith('guild-1', 'user-1', 'role-1');
        expect(discordRest.addMemberRole).not.toHaveBeenCalled();
      });

      it('역할 제거 실패(권한 부족) 시 false 를 반환하고 예외를 전파하지 않는다', async () => {
        discordRest.removeMemberRole.mockRejectedValue(new Error('Missing Permissions'));

        const result = await adapter.modifyRole('guild-1', 'user-1', 'role-1', 'remove');

        expect(result).toBe(false);
      });

      it('여러 멤버 역할 제거 중 일부 실패(부분 실패) 시 나머지는 계속 처리된다', async () => {
        discordRest.removeMemberRole
          .mockResolvedValueOnce(undefined) // user-1 성공
          .mockRejectedValueOnce(new Error('Missing Permissions')) // user-2 실패
          .mockResolvedValueOnce(undefined); // user-3 성공

        const userIds = ['user-1', 'user-2', 'user-3'];
        const results = await Promise.all(
          userIds.map((id) => adapter.modifyRole('guild-1', id, 'role-1', 'remove')),
        );

        expect(results).toEqual([true, false, true]);
      });
    });

    describe('add vs remove 라우팅', () => {
      it('action=add 이면 addMemberRole 을 호출하고 removeMemberRole 은 호출하지 않는다', async () => {
        discordRest.addMemberRole.mockResolvedValue(undefined);

        await adapter.modifyRole('guild-1', 'user-1', 'role-x', 'add');

        expect(discordRest.addMemberRole).toHaveBeenCalledTimes(1);
        expect(discordRest.removeMemberRole).not.toHaveBeenCalled();
      });

      it('action=remove 이면 removeMemberRole 을 호출하고 addMemberRole 은 호출하지 않는다', async () => {
        discordRest.removeMemberRole.mockResolvedValue(undefined);

        await adapter.modifyRole('guild-1', 'user-1', 'role-x', 'remove');

        expect(discordRest.removeMemberRole).toHaveBeenCalledTimes(1);
        expect(discordRest.addMemberRole).not.toHaveBeenCalled();
      });
    });

    it('modifyRole 실패 시 warn 로그를 남긴다', async () => {
      const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockReturnValue(undefined);
      discordRest.addMemberRole.mockRejectedValue(new Error('Forbidden'));

      await adapter.modifyRole('guild-1', 'user-99', 'role-1', 'add');

      expect(warnSpy).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 부분 실패 집계 — 호출자(service)가 false/null 결과를 카운트할 수 있는지 검증
  // ──────────────────────────────────────────────────────────────────────────────

  describe('부분 실패 집계 (호출자 측 검증)', () => {
    it('kick: 5명 중 2명 실패 → successCount=3, failCount=2 를 집계할 수 있다', async () => {
      discordRest.kickMember
        .mockResolvedValueOnce(undefined) // u1 성공
        .mockResolvedValueOnce(undefined) // u2 성공
        .mockRejectedValueOnce(new Error('err')) // u3 실패
        .mockResolvedValueOnce(undefined) // u4 성공
        .mockRejectedValueOnce(new Error('err')); // u5 실패

      const userIds = ['u1', 'u2', 'u3', 'u4', 'u5'];
      const outcomes = await Promise.all(
        userIds.map((id) => adapter.kickMember('guild-1', id, 'reason')),
      );

      const successCount = outcomes.filter(Boolean).length;
      const failCount = outcomes.filter((r) => !r).length;

      expect(successCount).toBe(3);
      expect(failCount).toBe(2);
    });

    it('DM: 4명 중 3명 차단 → successCount=1, failCount=3 를 집계할 수 있다', async () => {
      discordRest.sendDMEmbed
        .mockRejectedValueOnce(new Error('Cannot send')) // u1 실패
        .mockResolvedValueOnce(true) // u2 성공
        .mockRejectedValueOnce(new Error('Cannot send')) // u3 실패
        .mockRejectedValueOnce(new Error('Cannot send')); // u4 실패

      const userIds = ['u1', 'u2', 'u3', 'u4'];
      const outcomes = await Promise.all(
        userIds.map((id) => adapter.sendDm('guild-1', id, makeEmbed())),
      );

      const successCount = outcomes.filter(Boolean).length;
      const failCount = outcomes.filter((r) => !r).length;

      expect(successCount).toBe(1);
      expect(failCount).toBe(3);
    });

    it('modifyRole(add): 3명 중 1명 실패 → successCount=2, failCount=1 를 집계할 수 있다', async () => {
      discordRest.addMemberRole
        .mockResolvedValueOnce(undefined) // u1 성공
        .mockRejectedValueOnce(new Error('Missing Permissions')) // u2 실패
        .mockResolvedValueOnce(undefined); // u3 성공

      const userIds = ['u1', 'u2', 'u3'];
      const outcomes = await Promise.all(
        userIds.map((id) => adapter.modifyRole('guild-1', id, 'role-1', 'add')),
      );

      const successCount = outcomes.filter(Boolean).length;
      const failCount = outcomes.filter((r) => !r).length;

      expect(successCount).toBe(2);
      expect(failCount).toBe(1);
    });

    it('전체 성공: kick 3명 모두 성공 → successCount=3, failCount=0', async () => {
      discordRest.kickMember.mockResolvedValue(undefined);

      const outcomes = await Promise.all(
        ['u1', 'u2', 'u3'].map((id) => adapter.kickMember('guild-1', id, 'reason')),
      );

      expect(outcomes.every(Boolean)).toBe(true);
      expect(outcomes.filter(Boolean).length).toBe(3);
      expect(outcomes.filter((r) => !r).length).toBe(0);
    });

    it('전체 실패: kick 3명 모두 실패 → successCount=0, failCount=3', async () => {
      discordRest.kickMember.mockRejectedValue(new Error('Forbidden'));

      const outcomes = await Promise.all(
        ['u1', 'u2', 'u3'].map((id) => adapter.kickMember('guild-1', id, 'reason')),
      );

      expect(outcomes.every((r) => !r)).toBe(true);
      expect(outcomes.filter(Boolean).length).toBe(0);
      expect(outcomes.filter((r) => !r).length).toBe(3);
    });
  });
});
