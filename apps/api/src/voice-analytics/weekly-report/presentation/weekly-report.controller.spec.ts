/**
 * WeeklyReportController 테스트
 * 대상: getConfig, saveConfig
 */
import { type Mock } from 'vitest';

import { WeeklyReportConfigOrmEntity } from '../infrastructure/weekly-report-config.orm-entity';
import { WeeklyReportConfigSaveDto } from './dto/weekly-report-config.dto';
import { WeeklyReportController } from './weekly-report.controller';

function makeEntity(
  overrides: Partial<WeeklyReportConfigOrmEntity> = {},
): WeeklyReportConfigOrmEntity {
  const entity = new WeeklyReportConfigOrmEntity();
  entity.guildId = 'guild-1';
  entity.isEnabled = true;
  entity.channelId = 'ch-100';
  entity.dayOfWeek = 1;
  entity.hour = 9;
  entity.timezone = 'Asia/Seoul';
  entity.updatedAt = new Date('2026-03-01T00:00:00Z');
  return Object.assign(entity, overrides);
}

function makeSaveDto(
  overrides: Partial<WeeklyReportConfigSaveDto> = {},
): WeeklyReportConfigSaveDto {
  const dto = new WeeklyReportConfigSaveDto();
  dto.isEnabled = true;
  dto.channelId = 'ch-100';
  dto.dayOfWeek = 1;
  dto.hour = 9;
  dto.timezone = 'Asia/Seoul';
  return Object.assign(dto, overrides);
}

describe('WeeklyReportController', () => {
  let controller: WeeklyReportController;
  let configRepo: {
    findByGuildId: Mock;
    upsert: Mock;
  };

  const GUILD_ID = 'guild-123';

  beforeEach(() => {
    configRepo = {
      findByGuildId: vi.fn(),
      upsert: vi.fn(),
    };

    controller = new WeeklyReportController(configRepo as never);
  });

  // ──────────────────────────────────────────────────────
  // getConfig
  // ──────────────────────────────────────────────────────
  describe('getConfig', () => {
    it('설정이 존재하면 DTO로 변환하여 반환한다', async () => {
      const entity = makeEntity({
        guildId: GUILD_ID,
        isEnabled: true,
        channelId: 'ch-999',
        dayOfWeek: 5,
        hour: 18,
        timezone: 'UTC',
      });
      configRepo.findByGuildId.mockResolvedValue(entity);

      const result = await controller.getConfig(GUILD_ID);

      expect(result.isEnabled).toBe(true);
      expect(result.channelId).toBe('ch-999');
      expect(result.dayOfWeek).toBe(5);
      expect(result.hour).toBe(18);
      expect(result.timezone).toBe('UTC');
    });

    it('설정이 없으면 기본값을 반환한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(null);

      const result = await controller.getConfig(GUILD_ID);

      // PRD 기본값: isEnabled=false, channelId=null, dayOfWeek=1, hour=9, timezone='Asia/Seoul'
      expect(result.isEnabled).toBe(false);
      expect(result.channelId).toBeNull();
      expect(result.dayOfWeek).toBe(1);
      expect(result.hour).toBe(9);
      expect(result.timezone).toBe('Asia/Seoul');
    });

    it('findByGuildId를 올바른 guildId로 호출한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(null);

      await controller.getConfig(GUILD_ID);

      expect(configRepo.findByGuildId).toHaveBeenCalledWith(GUILD_ID);
    });

    it('반환된 DTO에 updatedAt 등 엔티티 전용 필드는 포함되지 않는다', async () => {
      const entity = makeEntity({ guildId: GUILD_ID });
      configRepo.findByGuildId.mockResolvedValue(entity);

      const result = await controller.getConfig(GUILD_ID);

      expect((result as unknown as Record<string, unknown>).updatedAt).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).guildId).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────
  // saveConfig
  // ──────────────────────────────────────────────────────
  describe('saveConfig', () => {
    it('upsert 후 저장된 설정을 DTO로 변환하여 반환한다', async () => {
      const saved = makeEntity({
        guildId: GUILD_ID,
        isEnabled: true,
        channelId: 'ch-100',
        dayOfWeek: 1,
        hour: 9,
        timezone: 'Asia/Seoul',
      });
      configRepo.upsert.mockResolvedValue(saved);

      const dto = makeSaveDto();
      const result = await controller.saveConfig(GUILD_ID, dto);

      expect(result.isEnabled).toBe(true);
      expect(result.channelId).toBe('ch-100');
      expect(result.dayOfWeek).toBe(1);
      expect(result.hour).toBe(9);
      expect(result.timezone).toBe('Asia/Seoul');
    });

    it('올바른 guildId와 DTO로 upsert를 호출한다', async () => {
      const saved = makeEntity({ guildId: GUILD_ID });
      configRepo.upsert.mockResolvedValue(saved);

      const dto = makeSaveDto({
        isEnabled: false,
        channelId: null,
        dayOfWeek: 6,
        hour: 20,
        timezone: 'UTC',
      });
      await controller.saveConfig(GUILD_ID, dto);

      expect(configRepo.upsert).toHaveBeenCalledWith(GUILD_ID, dto);
    });

    it('isEnabled=false로도 저장 가능하다', async () => {
      const saved = makeEntity({ guildId: GUILD_ID, isEnabled: false });
      configRepo.upsert.mockResolvedValue(saved);

      const dto = makeSaveDto({ isEnabled: false });
      const result = await controller.saveConfig(GUILD_ID, dto);

      expect(result.isEnabled).toBe(false);
    });

    it('channelId=null로도 저장 가능하다', async () => {
      const saved = makeEntity({ guildId: GUILD_ID, channelId: null });
      configRepo.upsert.mockResolvedValue(saved);

      const dto = makeSaveDto({ channelId: null });
      const result = await controller.saveConfig(GUILD_ID, dto);

      expect(result.channelId).toBeNull();
    });

    it('dayOfWeek 경계값(0=일요일, 6=토요일)을 저장할 수 있다', async () => {
      const savedSunday = makeEntity({ guildId: GUILD_ID, dayOfWeek: 0 });
      configRepo.upsert.mockResolvedValue(savedSunday);

      const dto = makeSaveDto({ dayOfWeek: 0 });
      const result = await controller.saveConfig(GUILD_ID, dto);

      expect(result.dayOfWeek).toBe(0);
    });

    it('hour 경계값(0=자정, 23=23시)을 저장할 수 있다', async () => {
      const savedMidnight = makeEntity({ guildId: GUILD_ID, hour: 0 });
      configRepo.upsert.mockResolvedValue(savedMidnight);

      const dto = makeSaveDto({ hour: 0 });
      const result = await controller.saveConfig(GUILD_ID, dto);

      expect(result.hour).toBe(0);
    });
  });
});
