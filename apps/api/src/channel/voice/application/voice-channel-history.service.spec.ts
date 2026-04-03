import { type Mock } from 'vitest';

import { type GuildMemberOrmEntity } from '../../../guild-member/infrastructure/guild-member.orm-entity';
import { type ChannelOrm } from '../../infrastructure/channel.orm-entity';
import { type VoiceChannelHistoryOrm } from '../infrastructure/voice-channel-history.orm-entity';
import { VoiceChannelHistoryService } from './voice-channel-history.service';

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

function makeChannel(overrides: Partial<ChannelOrm> = {}): ChannelOrm {
  return {
    id: 1,
    discordChannelId: 'ch-1',
    channelName: '일반',
    status: 'ACTIVE',
    voiceHistories: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as ChannelOrm;
}

function makeHistory(overrides: Partial<VoiceChannelHistoryOrm> = {}): VoiceChannelHistoryOrm {
  return {
    id: 1,
    guildMember: makeGuildMember(),
    channel: makeChannel(),
    joinedAt: new Date('2026-03-01T10:00:00Z'),
    leftAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as VoiceChannelHistoryOrm;
}

describe('VoiceChannelHistoryService', () => {
  let service: VoiceChannelHistoryService;
  let voiceChannelHistoryRepository: {
    create: Mock;
    save: Mock;
    createQueryBuilder: Mock;
    update: Mock;
  };
  let dataSource: { transaction: Mock };

  beforeEach(() => {
    voiceChannelHistoryRepository = {
      create: vi.fn(),
      save: vi.fn(),
      createQueryBuilder: vi.fn(),
      update: vi.fn(),
    };
    dataSource = {
      transaction: vi.fn(),
    };

    service = new VoiceChannelHistoryService(
      voiceChannelHistoryRepository as never,
      dataSource as never,
    );
  });

  // ──────────────────────────────────────────────────────
  // logJoin
  // ──────────────────────────────────────────────────────
  describe('logJoin', () => {
    it('입장 레코드를 생성하고 저장한다', async () => {
      const guildMember = makeGuildMember();
      const channel = makeChannel();
      const history = makeHistory({ guildMember, channel });

      voiceChannelHistoryRepository.create.mockReturnValue(history);
      voiceChannelHistoryRepository.save.mockResolvedValue(history);

      const result = await service.logJoin(guildMember, channel);

      expect(voiceChannelHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ guildMember, channel }),
      );
      expect(voiceChannelHistoryRepository.save).toHaveBeenCalledWith(history);
      expect(result).toBe(history);
    });

    it('생성된 레코드에 joinedAt이 포함된다', async () => {
      const guildMember = makeGuildMember();
      const channel = makeChannel();

      voiceChannelHistoryRepository.create.mockImplementation(
        (data: Partial<VoiceChannelHistoryOrm>) => data,
      );
      voiceChannelHistoryRepository.save.mockImplementation(
        async (data: VoiceChannelHistoryOrm) => data,
      );

      const result = await service.logJoin(guildMember, channel);

      expect(result.joinedAt).toBeInstanceOf(Date);
    });

    it('leftAt이 null로 초기화된 레코드를 생성한다', async () => {
      const guildMember = makeGuildMember();
      const channel = makeChannel();

      let createdData: Partial<VoiceChannelHistoryOrm> = {};
      voiceChannelHistoryRepository.create.mockImplementation(
        (data: Partial<VoiceChannelHistoryOrm>) => {
          createdData = data;
          return data;
        },
      );
      voiceChannelHistoryRepository.save.mockImplementation(
        async (data: VoiceChannelHistoryOrm) => data,
      );

      await service.logJoin(guildMember, channel);

      expect(createdData).not.toHaveProperty('leftAt', expect.anything());
    });
  });

  // ──────────────────────────────────────────────────────
  // logLeave
  // ──────────────────────────────────────────────────────
  describe('logLeave', () => {
    it('최신 미종료 레코드의 leftAt을 현재 시각으로 설정한다', async () => {
      const guildMember = makeGuildMember();
      const channel = makeChannel();
      const existingLog = { id: 42 };

      dataSource.transaction.mockImplementation(async (fn: (manager: unknown) => unknown) => {
        const manager = {
          createQueryBuilder: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            getRawOne: vi.fn().mockResolvedValue(existingLog),
          }),
          update: vi.fn().mockResolvedValue(undefined),
        };
        return fn(manager);
      });

      await service.logLeave(guildMember, channel);

      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('미종료 레코드가 없으면 update를 호출하지 않는다', async () => {
      const guildMember = makeGuildMember();
      const channel = makeChannel();
      let updateCalled = false;

      dataSource.transaction.mockImplementation(async (fn: (manager: unknown) => unknown) => {
        const manager = {
          createQueryBuilder: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            getRawOne: vi.fn().mockResolvedValue(null),
          }),
          update: vi.fn().mockImplementation(() => {
            updateCalled = true;
          }),
        };
        return fn(manager);
      });

      await service.logLeave(guildMember, channel);

      expect(updateCalled).toBe(false);
    });

    it('guildMemberId, channelId, leftAt IS NULL 조건으로 쿼리한다', async () => {
      const guildMember = makeGuildMember({ id: 5 });
      const channel = makeChannel({ id: 7 });

      const whereConditions: string[] = [];
      dataSource.transaction.mockImplementation(async (fn: (manager: unknown) => unknown) => {
        const manager = {
          createQueryBuilder: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockImplementation((cond: string) => {
              whereConditions.push(cond);
              return manager.createQueryBuilder();
            }),
            andWhere: vi.fn().mockImplementation((cond: string) => {
              whereConditions.push(cond);
              return manager.createQueryBuilder();
            }),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            getRawOne: vi.fn().mockResolvedValue(null),
          }),
          update: vi.fn().mockResolvedValue(undefined),
        };
        return fn(manager);
      });

      await service.logLeave(guildMember, channel);

      const allConditions = whereConditions.join(' ');
      expect(allConditions).toContain('guildMemberId');
      expect(allConditions).toContain('channelId');
      expect(allConditions).toContain('leftAt');
    });
  });

  // ──────────────────────────────────────────────────────
  // closeOrphanRecords
  // ──────────────────────────────────────────────────────
  describe('closeOrphanRecords', () => {
    it('leftAt IS NULL인 레코드를 일괄 종료하고 영향받은 수를 반환한다', async () => {
      const qb = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: 3 }),
      };
      voiceChannelHistoryRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.closeOrphanRecords();

      expect(result).toBe(3);
      expect(qb.execute).toHaveBeenCalled();
    });

    it('고아 레코드가 없으면 0 반환', async () => {
      const qb = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: 0 }),
      };
      voiceChannelHistoryRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.closeOrphanRecords();

      expect(result).toBe(0);
    });

    it('affected가 undefined이면 0 반환', async () => {
      const qb = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: undefined }),
      };
      voiceChannelHistoryRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.closeOrphanRecords();

      expect(result).toBe(0);
    });
  });
});
