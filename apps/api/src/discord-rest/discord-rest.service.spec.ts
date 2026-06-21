// discord-rest.service.spec.ts
import { Logger } from '@nestjs/common';
import { DiscordAPIError } from 'discord.js';
import { vi } from 'vitest';

import { DiscordRestService } from './discord-rest.service';

// DiscordAPIError는 생성자가 복잡하므로 최소 mock 헬퍼로 생성한다
function makeDiscordAPIError(status: number, code: number, message = 'error'): DiscordAPIError {
  // DiscordAPIError는 Error를 extends하며 status/code 프로퍼티를 갖는다
  const err = Object.create(DiscordAPIError.prototype) as DiscordAPIError;
  Object.defineProperties(err, {
    status: { value: status, writable: true, configurable: true },
    code: { value: code, writable: true, configurable: true },
    message: { value: message, writable: true, configurable: true },
    name: { value: 'DiscordAPIError', writable: true, configurable: true },
  });
  return err;
}

/** Discord 에러 코드: Unknown Channel */
const DISCORD_ERR_UNKNOWN_CHANNEL = 10003;
/** Discord 에러 코드: 권한 없음 (Missing Permissions) */
const DISCORD_ERR_MISSING_PERMISSIONS = 50013;
/** HTTP 상태 코드: Too Many Requests (Rate Limit) */
const HTTP_STATUS_RATE_LIMIT = 429;
/** HTTP 상태 코드: Forbidden */
const HTTP_STATUS_FORBIDDEN = 403;

describe('DiscordRestService', () => {
  let service: DiscordRestService;
  // ConfigService mock은 onModuleInit에서만 필요하므로 최소화
  const mockConfig = {
    get: vi.fn().mockReturnValue('fake-token'),
  };

  // private rest 필드를 직접 교체하는 방식으로 테스트한다
  let mockRest: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    // ConfigService는 onModuleInit에서만 사용 — onModuleInit 호출 없이 직접 생성
    service = new DiscordRestService(mockConfig as never);

    // private rest 필드 주입
    mockRest = { get: vi.fn() };
    (service as unknown as { rest: typeof mockRest }).rest = mockRest;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────
  // probeChannel
  // ──────────────────────────────────────────────────────────
  describe('probeChannel', () => {
    describe("'exists' 반환", () => {
      it('REST GET이 성공하면 exists를 반환한다', async () => {
        mockRest.get.mockResolvedValue({ id: 'ch-1', type: 2 });

        const result = await service.probeChannel('ch-1');

        expect(result).toBe('exists');
      });
    });

    describe("'gone' 반환 — 확실한 채널 삭제", () => {
      it('DiscordAPIError status=404이면 gone을 반환한다', async () => {
        mockRest.get.mockRejectedValue(makeDiscordAPIError(404, 0));

        const result = await service.probeChannel('ch-1');

        expect(result).toBe('gone');
      });

      it('DiscordAPIError code=10003(Unknown Channel)이면 gone을 반환한다', async () => {
        mockRest.get.mockRejectedValue(makeDiscordAPIError(200, DISCORD_ERR_UNKNOWN_CHANNEL));

        const result = await service.probeChannel('ch-1');

        expect(result).toBe('gone');
      });

      it('DiscordAPIError status=404이고 code=10003이면 gone을 반환한다', async () => {
        mockRest.get.mockRejectedValue(makeDiscordAPIError(404, DISCORD_ERR_UNKNOWN_CHANNEL));

        const result = await service.probeChannel('ch-1');

        expect(result).toBe('gone');
      });
    });

    describe("'unknown' 반환 — 일시 오류", () => {
      it('DiscordAPIError status=500 서버 오류이면 unknown을 반환한다', async () => {
        mockRest.get.mockRejectedValue(makeDiscordAPIError(500, 0, 'Internal Server Error'));

        const result = await service.probeChannel('ch-1');

        expect(result).toBe('unknown');
      });

      it('DiscordAPIError status=429(Rate Limit)이면 unknown을 반환한다', async () => {
        mockRest.get.mockRejectedValue(
          makeDiscordAPIError(HTTP_STATUS_RATE_LIMIT, 0, 'Too Many Requests'),
        );

        const result = await service.probeChannel('ch-1');

        expect(result).toBe('unknown');
      });

      it('네트워크 오류(일반 Error)이면 unknown을 반환한다', async () => {
        mockRest.get.mockRejectedValue(new Error('ECONNREFUSED'));

        const result = await service.probeChannel('ch-1');

        expect(result).toBe('unknown');
      });

      it('DiscordAPIError status=403(권한 없음)이면 unknown을 반환한다', async () => {
        mockRest.get.mockRejectedValue(
          makeDiscordAPIError(
            HTTP_STATUS_FORBIDDEN,
            DISCORD_ERR_MISSING_PERMISSIONS,
            'Missing Permissions',
          ),
        );

        const result = await service.probeChannel('ch-1');

        expect(result).toBe('unknown');
      });
    });

    describe('로깅 동작', () => {
      it('unknown 반환 시 logger.warn을 1회 호출한다', async () => {
        const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        mockRest.get.mockRejectedValue(new Error('network error'));

        await service.probeChannel('ch-999');

        expect(warnSpy).toHaveBeenCalledTimes(1);
        warnSpy.mockRestore();
      });

      it('gone 반환 시 logger.warn을 호출하지 않는다', async () => {
        const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        mockRest.get.mockRejectedValue(makeDiscordAPIError(404, 0));

        await service.probeChannel('ch-999');

        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
      });

      it('exists 반환 시 logger.warn을 호출하지 않는다', async () => {
        const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        mockRest.get.mockResolvedValue({ id: 'ch-1' });

        await service.probeChannel('ch-1');

        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
      });
    });
  });
});
