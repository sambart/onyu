import { Logger } from '@nestjs/common';
import { vi } from 'vitest';

import { SchedulerLockService } from './scheduler-lock.service';

const LOCK_TTL_SEC = 900; // 스케줄러 락 TTL 기본값 (초)
const LOCK_TTL_SHORT_SEC = 300; // 키 포맷 검증용 짧은 TTL

describe('SchedulerLockService', () => {
  let service: SchedulerLockService;
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;

  const mockRedis = {
    setNx: vi.fn(),
    delIfMatch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    loggerWarnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    service = new SchedulerLockService(mockRedis as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runExclusive', () => {
    // ─── 케이스 1: 획득 성공 ───────────────────────────────────────────────
    it('setNx가 true를 반환하면 task를 1회 실행하고 delIfMatch로 락을 해제한다', async () => {
      mockRedis.setNx.mockResolvedValue(true);
      mockRedis.delIfMatch.mockResolvedValue(1);
      const task = vi.fn().mockResolvedValue(undefined);

      await service.runExclusive('test-lock', LOCK_TTL_SEC, task);

      expect(task).toHaveBeenCalledTimes(1);
      expect(mockRedis.delIfMatch).toHaveBeenCalledTimes(1);
    });

    it('setNx 키는 scheduler:lock:{name} 형식으로 호출된다', async () => {
      mockRedis.setNx.mockResolvedValue(true);
      mockRedis.delIfMatch.mockResolvedValue(1);
      const task = vi.fn().mockResolvedValue(undefined);

      await service.runExclusive('my-job', LOCK_TTL_SHORT_SEC, task);

      expect(mockRedis.setNx).toHaveBeenCalledWith(
        'scheduler:lock:my-job',
        expect.any(String),
        LOCK_TTL_SHORT_SEC,
      );
    });

    it('delIfMatch는 setNx에 전달한 것과 동일한 key와 token으로 호출된다', async () => {
      let capturedKey: string | undefined;
      let capturedToken: string | undefined;

      mockRedis.setNx.mockImplementation((key: string, token: string) => {
        capturedKey = key;
        capturedToken = token;
        return Promise.resolve(true);
      });
      mockRedis.delIfMatch.mockResolvedValue(1);
      const task = vi.fn().mockResolvedValue(undefined);

      await service.runExclusive('my-job', LOCK_TTL_SHORT_SEC, task);

      expect(mockRedis.delIfMatch).toHaveBeenCalledWith(capturedKey, capturedToken);
    });

    // ─── 케이스 2: 이미 점유 ───────────────────────────────────────────────
    it('setNx가 false를 반환하면 task를 실행하지 않고 warn 로그를 남긴다', async () => {
      mockRedis.setNx.mockResolvedValue(false);
      const task = vi.fn().mockResolvedValue(undefined);

      await service.runExclusive('test-lock', LOCK_TTL_SEC, task);

      expect(task).not.toHaveBeenCalled();
      expect(mockRedis.delIfMatch).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    });

    // ─── 케이스 3: Redis 에러 → fail-open ────────────────────────────────
    it('setNx가 throw하면 task를 1회 실행하고(fail-open) delIfMatch는 호출하지 않는다', async () => {
      mockRedis.setNx.mockRejectedValue(new Error('connection lost'));
      const task = vi.fn().mockResolvedValue(undefined);

      await service.runExclusive('test-lock', LOCK_TTL_SEC, task);

      expect(task).toHaveBeenCalledTimes(1);
      expect(mockRedis.delIfMatch).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    });

    // ─── 케이스 4: task throw 시 finally에서 락 해제 ──────────────────────
    it('task가 throw해도 finally에서 delIfMatch가 호출되어 락이 해제된다', async () => {
      mockRedis.setNx.mockResolvedValue(true);
      mockRedis.delIfMatch.mockResolvedValue(1);
      const task = vi.fn().mockRejectedValue(new Error('task failed'));

      await expect(service.runExclusive('test-lock', LOCK_TTL_SEC, task)).rejects.toThrow(
        'task failed',
      );

      expect(mockRedis.delIfMatch).toHaveBeenCalledTimes(1);
    });

    // ─── 케이스 5: 해제 실패 흡수 ─────────────────────────────────────────
    it('delIfMatch가 throw해도 runExclusive는 throw하지 않고 warn 로그를 남긴다', async () => {
      mockRedis.setNx.mockResolvedValue(true);
      mockRedis.delIfMatch.mockRejectedValue(new Error('eval failed'));
      const task = vi.fn().mockResolvedValue(undefined);

      await expect(service.runExclusive('test-lock', LOCK_TTL_SEC, task)).resolves.toBeUndefined();

      expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    });

    // ─── 케이스 6: 토큰 고유성 ────────────────────────────────────────────
    it('연속 2회 호출 시 setNx에 전달되는 token이 서로 다르다', async () => {
      const capturedTokens: string[] = [];

      mockRedis.setNx.mockImplementation((_key: string, token: string) => {
        capturedTokens.push(token);
        return Promise.resolve(true);
      });
      mockRedis.delIfMatch.mockResolvedValue(1);
      const task = vi.fn().mockResolvedValue(undefined);

      await service.runExclusive('test-lock', LOCK_TTL_SEC, task);
      await service.runExclusive('test-lock', LOCK_TTL_SEC, task);

      expect(capturedTokens).toHaveLength(2);
      expect(capturedTokens[0]).not.toBe(capturedTokens[1]);
    });
  });
});
