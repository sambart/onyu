/**
 * WeeklyReportConfigRepository 단위 테스트
 * 대상: findByGuildId, findAllEnabled, upsert
 */
import { type Mock } from 'vitest';

import type { WeeklyReportConfigSaveDto } from '../presentation/dto/weekly-report-config.dto';
import { WeeklyReportConfigOrmEntity } from './weekly-report-config.orm-entity';
import { WeeklyReportConfigRepository } from './weekly-report-config.repository';

function makeConfig(
  overrides: Partial<WeeklyReportConfigOrmEntity> = {},
): WeeklyReportConfigOrmEntity {
  const entity = new WeeklyReportConfigOrmEntity();
  entity.guildId = 'guild-1';
  entity.isEnabled = false;
  entity.channelId = null;
  entity.dayOfWeek = 1;
  entity.hour = 9;
  entity.timezone = 'Asia/Seoul';
  entity.updatedAt = new Date('2026-03-01T00:00:00Z');
  return Object.assign(entity, overrides);
}

function makeSaveDto(
  overrides: Partial<WeeklyReportConfigSaveDto> = {},
): WeeklyReportConfigSaveDto {
  return {
    isEnabled: true,
    channelId: 'ch-100',
    dayOfWeek: 1,
    hour: 9,
    timezone: 'Asia/Seoul',
    ...overrides,
  };
}

describe('WeeklyReportConfigRepository', () => {
  let repository: WeeklyReportConfigRepository;
  let ormRepo: {
    findOne: Mock;
    find: Mock;
    create: Mock;
    save: Mock;
  };

  beforeEach(() => {
    ormRepo = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
    };

    repository = new WeeklyReportConfigRepository(ormRepo as never);
  });

  // ──────────────────────────────────────────────────────
  // findByGuildId
  // ──────────────────────────────────────────────────────
  describe('findByGuildId', () => {
    it('존재하는 guildId면 엔티티를 반환한다', async () => {
      const config = makeConfig({ guildId: 'guild-1' });
      ormRepo.findOne.mockResolvedValue(config);

      const result = await repository.findByGuildId('guild-1');

      expect(result).toEqual(config);
      expect(ormRepo.findOne).toHaveBeenCalledWith({ where: { guildId: 'guild-1' } });
    });

    it('존재하지 않는 guildId면 null을 반환한다', async () => {
      ormRepo.findOne.mockResolvedValue(null);

      const result = await repository.findByGuildId('nonexistent-guild');

      expect(result).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────
  // findAllEnabled
  // ──────────────────────────────────────────────────────
  describe('findAllEnabled', () => {
    it('isEnabled=true인 길드 목록을 반환한다', async () => {
      const configs = [
        makeConfig({ guildId: 'guild-1', isEnabled: true }),
        makeConfig({ guildId: 'guild-2', isEnabled: true }),
      ];
      ormRepo.find.mockResolvedValue(configs);

      const result = await repository.findAllEnabled();

      expect(result).toHaveLength(2);
      expect(ormRepo.find).toHaveBeenCalledWith({ where: { isEnabled: true } });
    });

    it('활성화된 길드가 없으면 빈 배열을 반환한다', async () => {
      ormRepo.find.mockResolvedValue([]);

      const result = await repository.findAllEnabled();

      expect(result).toEqual([]);
    });

    it('isEnabled=false인 길드는 포함되지 않는다 (쿼리 조건 확인)', async () => {
      ormRepo.find.mockResolvedValue([makeConfig({ guildId: 'guild-1', isEnabled: true })]);

      await repository.findAllEnabled();

      expect(ormRepo.find).toHaveBeenCalledWith({ where: { isEnabled: true } });
    });
  });

  // ──────────────────────────────────────────────────────
  // upsert
  // ──────────────────────────────────────────────────────
  describe('upsert', () => {
    it('기존 설정이 없으면 새로 생성하여 저장한다', async () => {
      ormRepo.findOne.mockResolvedValue(null);
      const newConfig = makeConfig({ guildId: 'guild-new', isEnabled: true, channelId: 'ch-100' });
      ormRepo.create.mockReturnValue(newConfig);
      ormRepo.save.mockResolvedValue(newConfig);

      const dto = makeSaveDto({ isEnabled: true, channelId: 'ch-100' });
      const result = await repository.upsert('guild-new', dto);

      expect(ormRepo.create).toHaveBeenCalledWith({ guildId: 'guild-new', ...dto });
      expect(ormRepo.save).toHaveBeenCalledWith(newConfig);
      expect(result).toEqual(newConfig);
    });

    it('기존 설정이 있으면 필드를 업데이트하고 저장한다', async () => {
      const existing = makeConfig({ guildId: 'guild-1', isEnabled: false, channelId: null });
      ormRepo.findOne.mockResolvedValue(existing);
      ormRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      const dto = makeSaveDto({
        isEnabled: true,
        channelId: 'ch-999',
        dayOfWeek: 5,
        hour: 18,
        timezone: 'UTC',
      });
      const result = await repository.upsert('guild-1', dto);

      expect(result.isEnabled).toBe(true);
      expect(result.channelId).toBe('ch-999');
      expect(result.dayOfWeek).toBe(5);
      expect(result.hour).toBe(18);
      expect(result.timezone).toBe('UTC');
      // create는 호출되지 않아야 함
      expect(ormRepo.create).not.toHaveBeenCalled();
    });

    it('upsert 후 save를 반드시 호출한다', async () => {
      ormRepo.findOne.mockResolvedValue(null);
      const newConfig = makeConfig();
      ormRepo.create.mockReturnValue(newConfig);
      ormRepo.save.mockResolvedValue(newConfig);

      await repository.upsert('guild-1', makeSaveDto());

      expect(ormRepo.save).toHaveBeenCalledTimes(1);
    });

    it('channelId=null로 업데이트 가능하다', async () => {
      const existing = makeConfig({ guildId: 'guild-1', channelId: 'ch-old' });
      ormRepo.findOne.mockResolvedValue(existing);
      ormRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      const dto = makeSaveDto({ channelId: null });
      const result = await repository.upsert('guild-1', dto);

      expect(result.channelId).toBeNull();
    });
  });
});
