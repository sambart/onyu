import { Logger } from '@nestjs/common';
import * as sharedHelpers from '@onyu/shared';
import { vi } from 'vitest';

import { InactiveMemberGrade } from '../domain/inactive-member.types';
import type { InactiveMemberRecord } from '../domain/inactive-member-record.entity';
import { InactiveMemberScheduler } from './inactive-member.scheduler';

// getKSTDateString을 mock하여 결정적인 날짜 반환
vi.mock('@onyu/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof sharedHelpers>();
  return {
    ...actual,
    getKSTDateString: vi.fn(),
  };
});

const mockGetKSTDateString = vi.mocked(sharedHelpers.getKSTDateString);

function makeRecord(grade: InactiveMemberGrade | null): InactiveMemberRecord {
  return {
    guildId: 'guild-1',
    userId: 'user-1',
    nickName: null,
    grade,
    totalMinutes: 0,
    prevTotalMinutes: 0,
    lastVoiceDate: null,
    gradeChangedAt: null,
    classifiedAt: new Date(),
    isInactive: grade !== null,
  } as unknown as InactiveMemberRecord;
}

describe('InactiveMemberScheduler', () => {
  let scheduler: InactiveMemberScheduler;

  const mockRepo = {
    findAllConfiguredGuildIds: vi.fn(),
    saveTrendSnapshot: vi.fn(),
    deleteTrendBefore: vi.fn(),
  };

  const mockInactiveMemberService = {
    classifyGuild: vi.fn(),
    getOrCreateConfig: vi.fn(),
  };

  const mockActionService = {
    executeAutoActions: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    scheduler = new InactiveMemberScheduler(
      mockInactiveMemberService as never,
      mockActionService as never,
      mockRepo as never,
    );
  });

  // -----------------------------------------------------------------
  // aggregateGradeCounts (private 메서드를 간접 검증)
  // runDailyClassify -> processAllGuilds -> aggregateGradeCounts 경로
  // -----------------------------------------------------------------
  describe('aggregateGradeCounts (간접 검증)', () => {
    it('FULLY_INACTIVE, LOW_ACTIVE, DECLINING 각 등급별 카운트를 정확히 집계한다', async () => {
      mockRepo.findAllConfiguredGuildIds.mockResolvedValueOnce(['guild-1']);
      mockInactiveMemberService.getOrCreateConfig.mockResolvedValueOnce({
        autoActionEnabled: false,
      });

      const records = [
        makeRecord(InactiveMemberGrade.FULLY_INACTIVE),
        makeRecord(InactiveMemberGrade.FULLY_INACTIVE),
        makeRecord(InactiveMemberGrade.LOW_ACTIVE),
        makeRecord(InactiveMemberGrade.DECLINING),
        makeRecord(null), // 활동 회원 — 카운트에서 제외되지만 totalClassified에는 포함
      ];
      mockInactiveMemberService.classifyGuild.mockResolvedValueOnce(records);
      mockRepo.saveTrendSnapshot.mockResolvedValueOnce(undefined);
      mockGetKSTDateString.mockReturnValue('20260412');

      await scheduler.runDailyClassify();

      expect(mockRepo.saveTrendSnapshot).toHaveBeenCalledWith('guild-1', '2026-04-12', {
        fullyInactiveCount: 2,
        lowActiveCount: 1,
        decliningCount: 1,
        totalClassified: 5,
      });
    });

    it('레코드가 없으면 모든 카운트가 0이다', async () => {
      mockRepo.findAllConfiguredGuildIds.mockResolvedValueOnce(['guild-1']);
      mockInactiveMemberService.classifyGuild.mockResolvedValueOnce([]);
      mockRepo.saveTrendSnapshot.mockResolvedValueOnce(undefined);
      mockInactiveMemberService.getOrCreateConfig.mockResolvedValueOnce({
        autoActionEnabled: false,
      });
      mockGetKSTDateString.mockReturnValue('20260412');

      await scheduler.runDailyClassify();

      expect(mockRepo.saveTrendSnapshot).toHaveBeenCalledWith('guild-1', '2026-04-12', {
        fullyInactiveCount: 0,
        lowActiveCount: 0,
        decliningCount: 0,
        totalClassified: 0,
      });
    });

    it('FULLY_INACTIVE만 있는 경우 other 카운트는 0이다', async () => {
      mockRepo.findAllConfiguredGuildIds.mockResolvedValueOnce(['guild-1']);
      mockInactiveMemberService.classifyGuild.mockResolvedValueOnce([
        makeRecord(InactiveMemberGrade.FULLY_INACTIVE),
        makeRecord(InactiveMemberGrade.FULLY_INACTIVE),
        makeRecord(InactiveMemberGrade.FULLY_INACTIVE),
      ]);
      mockRepo.saveTrendSnapshot.mockResolvedValueOnce(undefined);
      mockInactiveMemberService.getOrCreateConfig.mockResolvedValueOnce({
        autoActionEnabled: false,
      });
      mockGetKSTDateString.mockReturnValue('20260412');

      await scheduler.runDailyClassify();

      expect(mockRepo.saveTrendSnapshot).toHaveBeenCalledWith('guild-1', '2026-04-12', {
        fullyInactiveCount: 3,
        lowActiveCount: 0,
        decliningCount: 0,
        totalClassified: 3,
      });
    });
  });

  // -----------------------------------------------------------------
  // getTodayDateString (private 메서드를 간접 검증)
  // -----------------------------------------------------------------
  describe('getTodayDateString (간접 검증)', () => {
    it('YYYYMMDD 형식을 YYYY-MM-DD 형식으로 변환하여 saveTrendSnapshot에 전달한다', async () => {
      mockRepo.findAllConfiguredGuildIds.mockResolvedValueOnce(['guild-1']);
      mockInactiveMemberService.classifyGuild.mockResolvedValueOnce([]);
      mockRepo.saveTrendSnapshot.mockResolvedValueOnce(undefined);
      mockInactiveMemberService.getOrCreateConfig.mockResolvedValueOnce({
        autoActionEnabled: false,
      });
      mockGetKSTDateString.mockReturnValue('20260101');

      await scheduler.runDailyClassify();

      const callArgs = mockRepo.saveTrendSnapshot.mock.calls[0] as [string, string, unknown];
      const dateArg = callArgs[1];
      expect(dateArg).toBe('2026-01-01');
    });

    it('다양한 날짜에 대해 YYYY-MM-DD 형식을 반환한다', async () => {
      const testCases = [
        { input: '20260101', expected: '2026-01-01' },
        { input: '20261231', expected: '2026-12-31' },
        { input: '20260229', expected: '2026-02-29' },
      ];

      for (const { input, expected } of testCases) {
        vi.clearAllMocks();
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

        mockRepo.findAllConfiguredGuildIds.mockResolvedValueOnce(['guild-1']);
        mockInactiveMemberService.classifyGuild.mockResolvedValueOnce([]);
        mockRepo.saveTrendSnapshot.mockResolvedValueOnce(undefined);
        mockInactiveMemberService.getOrCreateConfig.mockResolvedValueOnce({
          autoActionEnabled: false,
        });
        mockGetKSTDateString.mockReturnValue(input);

        await scheduler.runDailyClassify();

        const callArgs = mockRepo.saveTrendSnapshot.mock.calls[0] as [string, string, unknown];
        expect(callArgs[1]).toBe(expected);
      }
    });
  });

  // -----------------------------------------------------------------
  // purgeTrendData
  // -----------------------------------------------------------------
  describe('purgeTrendData', () => {
    it('90일 이전 레코드 삭제를 repo.deleteTrendBefore(90)으로 위임한다', async () => {
      mockRepo.deleteTrendBefore.mockResolvedValueOnce(5);

      await scheduler.purgeTrendData();

      expect(mockRepo.deleteTrendBefore).toHaveBeenCalledWith(90);
      expect(mockRepo.deleteTrendBefore).toHaveBeenCalledTimes(1);
    });

    it('삭제된 레코드가 0건이어도 오류 없이 완료된다', async () => {
      mockRepo.deleteTrendBefore.mockResolvedValueOnce(0);

      await expect(scheduler.purgeTrendData()).resolves.not.toThrow();
    });

    it('deleteTrendBefore가 예외를 던져도 purgeTrendData가 전파하지 않는다', async () => {
      mockRepo.deleteTrendBefore.mockRejectedValueOnce(new Error('DB error'));

      await expect(scheduler.purgeTrendData()).resolves.not.toThrow();
    });
  });

  // -----------------------------------------------------------------
  // processAllGuilds — 스냅샷 저장 후 자동 조치 실행 순서
  // -----------------------------------------------------------------
  describe('processAllGuilds (스냅샷 저장 → 자동 조치 순서)', () => {
    it('saveTrendSnapshot 실패 시 해당 길드의 자동 조치도 실행되지 않는다', async () => {
      mockRepo.findAllConfiguredGuildIds.mockResolvedValueOnce(['guild-1']);
      mockInactiveMemberService.classifyGuild.mockResolvedValueOnce([
        makeRecord(InactiveMemberGrade.FULLY_INACTIVE),
      ]);
      mockRepo.saveTrendSnapshot.mockRejectedValueOnce(new Error('DB error'));
      mockGetKSTDateString.mockReturnValue('20260412');

      // 예외가 catch 되어 runDailyClassify 자체는 throw하지 않아야 한다
      await expect(scheduler.runDailyClassify()).resolves.not.toThrow();

      // 자동 조치는 실행되지 않아야 한다
      expect(mockActionService.executeAutoActions).not.toHaveBeenCalled();
    });

    it('autoActionEnabled가 false이면 자동 조치를 실행하지 않는다', async () => {
      mockRepo.findAllConfiguredGuildIds.mockResolvedValueOnce(['guild-1']);
      mockInactiveMemberService.classifyGuild.mockResolvedValueOnce([
        makeRecord(InactiveMemberGrade.FULLY_INACTIVE),
      ]);
      mockRepo.saveTrendSnapshot.mockResolvedValueOnce(undefined);
      mockInactiveMemberService.getOrCreateConfig.mockResolvedValueOnce({
        autoActionEnabled: false,
      });
      mockGetKSTDateString.mockReturnValue('20260412');

      await scheduler.runDailyClassify();

      expect(mockActionService.executeAutoActions).not.toHaveBeenCalled();
    });

    it('여러 길드가 설정되어 있으면 각 길드마다 스냅샷을 저장한다', async () => {
      mockRepo.findAllConfiguredGuildIds.mockResolvedValueOnce(['guild-1', 'guild-2']);
      mockInactiveMemberService.classifyGuild
        .mockResolvedValueOnce([makeRecord(InactiveMemberGrade.FULLY_INACTIVE)])
        .mockResolvedValueOnce([makeRecord(InactiveMemberGrade.LOW_ACTIVE)]);
      mockRepo.saveTrendSnapshot.mockResolvedValue(undefined);
      mockInactiveMemberService.getOrCreateConfig.mockResolvedValue({ autoActionEnabled: false });
      mockGetKSTDateString.mockReturnValue('20260412');

      await scheduler.runDailyClassify();

      expect(mockRepo.saveTrendSnapshot).toHaveBeenCalledTimes(2);
      expect(mockRepo.saveTrendSnapshot).toHaveBeenCalledWith(
        'guild-1',
        '2026-04-12',
        expect.objectContaining({ fullyInactiveCount: 1, lowActiveCount: 0 }),
      );
      expect(mockRepo.saveTrendSnapshot).toHaveBeenCalledWith(
        'guild-2',
        '2026-04-12',
        expect.objectContaining({ fullyInactiveCount: 0, lowActiveCount: 1 }),
      );
    });
  });
});
