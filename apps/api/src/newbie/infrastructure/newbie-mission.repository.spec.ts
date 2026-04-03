import { type Mock } from 'vitest';

import { MissionStatus } from '../domain/newbie-mission.types';
import { type NewbieMissionOrmEntity as NewbieMission } from './newbie-mission.orm-entity';
import { NewbieMissionRepository } from './newbie-mission.repository';

function makeMission(overrides: Partial<NewbieMission> = {}): NewbieMission {
  return {
    id: 1,
    guildId: 'guild-1',
    memberId: 'user-1',
    memberName: '동현',
    startDate: '20260301',
    endDate: '20260308',
    targetPlaytimeSec: 10800,
    status: MissionStatus.IN_PROGRESS,
    hiddenFromEmbed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('NewbieMissionRepository', () => {
  let repository: NewbieMissionRepository;
  let repo: {
    find: Mock;
    findOne: Mock;
    findAndCount: Mock;
    count: Mock;
    save: Mock;
    update: Mock;
    delete: Mock;
    create: Mock;
    createQueryBuilder: Mock;
  };

  beforeEach(() => {
    const makeQb = (rawResult: unknown = null) => {
      const qb: Record<string, Mock> = {};
      const chain = () => qb as never;
      qb.select = vi.fn().mockReturnValue(chain());
      qb.addSelect = vi.fn().mockReturnValue(chain());
      qb.where = vi.fn().mockReturnValue(chain());
      qb.groupBy = vi.fn().mockReturnValue(chain());
      qb.getRawMany = vi.fn().mockResolvedValue(rawResult ?? []);
      return qb;
    };

    repo = {
      find: vi.fn(),
      findOne: vi.fn(),
      findAndCount: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      createQueryBuilder: vi.fn().mockReturnValue(makeQb()),
    };

    repository = new NewbieMissionRepository(repo as never);
  });

  // ──────────────────────────────────────────────────────
  // findByGuild
  // ──────────────────────────────────────────────────────
  describe('findByGuild', () => {
    it('status 없이 호출하면 where에 status 조건 없이 전체 조회', async () => {
      const items = [makeMission()];
      repo.findAndCount.mockResolvedValue([items, 1]);

      const result = await repository.findByGuild('guild-1', undefined, 1, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { guildId: 'guild-1' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({ items, total: 1 });
    });

    it('status=IN_PROGRESS이면 where에 status 조건 추가', async () => {
      const items = [makeMission()];
      repo.findAndCount.mockResolvedValue([items, 1]);

      const result = await repository.findByGuild('guild-1', MissionStatus.IN_PROGRESS, 1, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { guildId: 'guild-1', status: MissionStatus.IN_PROGRESS },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({ items, total: 1 });
    });

    it('status=COMPLETED이면 where에 status 조건 추가', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await repository.findByGuild('guild-1', MissionStatus.COMPLETED, 1, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { guildId: 'guild-1', status: MissionStatus.COMPLETED },
        }),
      );
    });

    it('status=FAILED이면 where에 status 조건 추가', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await repository.findByGuild('guild-1', MissionStatus.FAILED, 1, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { guildId: 'guild-1', status: MissionStatus.FAILED },
        }),
      );
    });

    it('status=LEFT이면 where에 status 조건 추가', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await repository.findByGuild('guild-1', MissionStatus.LEFT, 1, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { guildId: 'guild-1', status: MissionStatus.LEFT },
        }),
      );
    });

    it('page=2, pageSize=5 → skip=5, take=5', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await repository.findByGuild('guild-1', undefined, 2, 5);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
        }),
      );
    });

    it('page=3, pageSize=10 → skip=20, take=10', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await repository.findByGuild('guild-1', undefined, 3, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });

    it('결과를 { items, total } 형태로 반환한다', async () => {
      const missions = [makeMission({ id: 1 }), makeMission({ id: 2 })];
      repo.findAndCount.mockResolvedValue([missions, 15]);

      const result = await repository.findByGuild('guild-1', undefined, 1, 10);

      expect(result.items).toEqual(missions);
      expect(result.total).toBe(15);
    });

    it('createdAt DESC 정렬이 적용된다', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await repository.findByGuild('guild-1', undefined, 1, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });
});
