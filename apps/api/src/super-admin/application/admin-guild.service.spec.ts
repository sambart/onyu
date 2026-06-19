import type { APIGuild } from 'discord.js';
import type { Mocked } from 'vitest';

import type { DiscordRestService } from '../../discord-rest/discord-rest.service';
import type { AdminGuildDto } from '../dto/admin-guild.dto';
import type {
  AdminGuildRepository,
  GuildDistinctRow,
} from '../infrastructure/admin-guild.repository';
import { AdminGuildService } from './admin-guild.service';

function makeRepo(rows: GuildDistinctRow[]): Mocked<AdminGuildRepository> {
  return {
    findDistinctGuilds: vi.fn().mockResolvedValue(rows),
  } as unknown as Mocked<AdminGuildRepository>;
}

function makeDiscordRest(
  fetchGuildImpl: (guildId: string) => Promise<Partial<APIGuild> | null>,
): Mocked<DiscordRestService> {
  return {
    fetchGuild: vi.fn().mockImplementation(fetchGuildImpl),
  } as unknown as Mocked<DiscordRestService>;
}

describe('AdminGuildService', () => {
  describe('listGuilds', () => {
    /**
     * QA C.P1: 길드 목록 출처(guild_member distinct) 정확성
     * Plan §4.6: distinct repo + fetchGuild mock → DTO 매핑 검증
     */
    it('findDistinctGuilds 결과를 AdminGuildDto[] 로 변환하여 반환한다', async () => {
      const rows: GuildDistinctRow[] = [
        { guildId: 'g1', memberCount: 10 },
        { guildId: 'g2', memberCount: 5 },
      ];
      const repo = makeRepo(rows);
      const discordRest = makeDiscordRest((guildId) =>
        Promise.resolve({ name: `Guild ${guildId}`, icon: `icon-${guildId}` }),
      );
      const service = new AdminGuildService(repo, discordRest as DiscordRestService);

      const result = await service.listGuilds();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual<AdminGuildDto>({
        id: 'g1',
        name: 'Guild g1',
        icon: 'icon-g1',
        memberCount: 10,
        joinedAt: null,
      });
      expect(result[1]).toEqual<AdminGuildDto>({
        id: 'g2',
        name: 'Guild g2',
        icon: 'icon-g2',
        memberCount: 5,
        joinedAt: null,
      });
    });

    /**
     * QA C.P1: 반환 순서가 repo distinct 집계 순서를 따른다(중복 없음)
     */
    it('각 guildId 에 대해 fetchGuild 를 정확히 1회씩 호출한다', async () => {
      const rows: GuildDistinctRow[] = [
        { guildId: 'g1', memberCount: 3 },
        { guildId: 'g2', memberCount: 7 },
      ];
      const repo = makeRepo(rows);
      const discordRest = makeDiscordRest((guildId) =>
        Promise.resolve({ name: `N-${guildId}`, icon: null }),
      );
      const service = new AdminGuildService(repo, discordRest as DiscordRestService);

      await service.listGuilds();

      expect(discordRest.fetchGuild).toHaveBeenCalledTimes(2);
      expect(discordRest.fetchGuild).toHaveBeenCalledWith('g1');
      expect(discordRest.fetchGuild).toHaveBeenCalledWith('g2');
    });

    /**
     * QA C.P2: fetchGuild 실패(null 반환) → name=guildId fallback, icon=null, 목록 200
     * Plan §4.6: fetchGuild null → name=guildId fallback (E9)
     */
    it('fetchGuild 가 null 을 반환하면 name=guildId fallback, icon=null 로 반환한다', async () => {
      const rows: GuildDistinctRow[] = [{ guildId: 'g-unknown', memberCount: 0 }];
      const repo = makeRepo(rows);
      const discordRest = makeDiscordRest(() => Promise.resolve(null));
      const service = new AdminGuildService(repo, discordRest as DiscordRestService);

      const result = await service.listGuilds();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual<AdminGuildDto>({
        id: 'g-unknown',
        name: 'g-unknown', // guildId fallback
        icon: null,
        memberCount: 0,
        joinedAt: null,
      });
    });

    /**
     * fetchGuild 가 name 없이 icon 만 반환하는 엣지케이스 (name fallback, icon 정상)
     */
    it('fetchGuild 메타에 name 없으면 name=guildId fallback, icon 은 정상 반환', async () => {
      const rows: GuildDistinctRow[] = [{ guildId: 'g-partial', memberCount: 2 }];
      const repo = makeRepo(rows);
      const discordRest = makeDiscordRest(() =>
        // APIGuild 의 name 을 undefined 로 시뮬레이션
        Promise.resolve({ name: undefined, icon: 'some-icon' } as unknown as APIGuild),
      );
      const service = new AdminGuildService(repo, discordRest as DiscordRestService);

      const result = await service.listGuilds();

      expect(result[0]?.name).toBe('g-partial'); // guildId fallback
      expect(result[0]?.icon).toBe('some-icon');
    });

    /**
     * QA C.P2: fetchGuild 일부 실패해도 나머지 길드는 정상 반환 (목록 자체는 200)
     */
    it('fetchGuild 가 일부 실패(null)해도 나머지 길드 정상 포함하여 전체 반환', async () => {
      const rows: GuildDistinctRow[] = [
        { guildId: 'g1', memberCount: 5 },
        { guildId: 'g-fail', memberCount: 3 },
        { guildId: 'g2', memberCount: 8 },
      ];
      const repo = makeRepo(rows);
      const discordRest = makeDiscordRest((guildId) => {
        if (guildId === 'g-fail') return Promise.resolve(null);
        return Promise.resolve({ name: `Guild ${guildId}`, icon: null });
      });
      const service = new AdminGuildService(repo, discordRest as DiscordRestService);

      const result = await service.listGuilds();

      expect(result).toHaveLength(3);
      expect(result.find((r) => r.id === 'g-fail')?.name).toBe('g-fail'); // fallback
      expect(result.find((r) => r.id === 'g1')?.name).toBe('Guild g1');
      expect(result.find((r) => r.id === 'g2')?.name).toBe('Guild g2');
    });

    /**
     * Plan §4.6: 빈 길드 → { guilds:[], total:0 } 처럼 빈 배열 반환 (E10)
     * 주의: 실제 구현은 AdminGuildDto[] 직접 반환 (래퍼 없음) — Endpoint Spec §1 기준
     */
    it('guild_member 가 비어 있으면 빈 배열을 반환한다 (E10)', async () => {
      const repo = makeRepo([]);
      const discordRest = makeDiscordRest(() => Promise.resolve(null));
      const service = new AdminGuildService(repo, discordRest as DiscordRestService);

      const result = await service.listGuilds();

      expect(result).toEqual([]);
      expect(discordRest.fetchGuild).not.toHaveBeenCalled();
    });

    /**
     * joinedAt 은 항상 null (봇 참여일 데이터 소스 미확정 — Plan §길드 목록 데이터 출처)
     */
    it('joinedAt 은 항상 null 을 반환한다', async () => {
      const rows: GuildDistinctRow[] = [{ guildId: 'g1', memberCount: 1 }];
      const repo = makeRepo(rows);
      const discordRest = makeDiscordRest(() =>
        Promise.resolve({ name: 'Test Guild', icon: null }),
      );
      const service = new AdminGuildService(repo, discordRest as DiscordRestService);

      const result = await service.listGuilds();

      expect(result[0]?.joinedAt).toBeNull();
    });

    /**
     * memberCount 는 repo 집계값(숫자)을 그대로 반환한다
     */
    it('memberCount 는 repo 에서 받은 숫자 값을 그대로 포함한다', async () => {
      const rows: GuildDistinctRow[] = [{ guildId: 'g1', memberCount: 42 }];
      const repo = makeRepo(rows);
      const discordRest = makeDiscordRest(() => Promise.resolve({ name: 'Guild', icon: null }));
      const service = new AdminGuildService(repo, discordRest as DiscordRestService);

      const result = await service.listGuilds();

      expect(result[0]?.memberCount).toBe(42);
    });

    /**
     * memberCount 가 0 인 경우(멤버 미수집 길드) 도 정상 반환
     */
    it('memberCount=0 인 길드도 정상 포함하여 반환한다', async () => {
      const rows: GuildDistinctRow[] = [{ guildId: 'g-empty', memberCount: 0 }];
      const repo = makeRepo(rows);
      const discordRest = makeDiscordRest(() =>
        Promise.resolve({ name: 'Empty Guild', icon: null }),
      );
      const service = new AdminGuildService(repo, discordRest as DiscordRestService);

      const result = await service.listGuilds();

      expect(result[0]?.memberCount).toBe(0);
    });
  });
});
