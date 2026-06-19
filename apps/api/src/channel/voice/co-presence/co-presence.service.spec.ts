/**
 * CoPresenceService 단위 테스트 — 영속화 라이프사이클 보강
 *
 * 검증 범위:
 *   B-1. onApplicationBootstrap: snapshotRepo.load 결과로 activeSessions 복원
 *   B-2. reconcile 말미: snapshotRepo.save 호출
 *   B-3. endAllSessions: 빈 세션에서도 snapshotRepo.clear 호출 (clear-before-early-return)
 *   B-4. fail-soft: snapshotRepo.save 가 reject 여도 reconcile 이 throw 하지 않는다
 *
 * 모든 외부 의존성(CoPresenceDbRepository, EventEmitter2, CoPresenceSnapshotRepository)은
 * vi.fn() 으로 mock 한다.
 */

import type { EventEmitter2 } from '@nestjs/event-emitter';

import type { CoPresenceTickSnapshot } from './co-presence.events';
import { CoPresenceService } from './co-presence.service';
import type { CoPresenceDbRepository } from './co-presence-db.repository';
import type {
  CoPresenceSnapshotRepository,
  RestorableSession,
} from './infrastructure/co-presence-snapshot.repository';

// ─── mock 헬퍼 ────────────────────────────────────────────────────────────────

function makeDbRepo(): jest.Mocked<CoPresenceDbRepository> {
  return {
    saveSession: vi.fn().mockResolvedValue(undefined),
    saveSessionBatch: vi.fn().mockResolvedValue(undefined),
    upsertDaily: vi.fn().mockResolvedValue(undefined),
    upsertDailyBatch: vi.fn().mockResolvedValue(undefined),
    upsertPairDailyBatch: vi.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CoPresenceDbRepository>;
}

function makeEventEmitter(): jest.Mocked<EventEmitter2> {
  return {
    emitAsync: vi.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<EventEmitter2>;
}

function makeSnapshotRepo(): jest.Mocked<CoPresenceSnapshotRepository> {
  return {
    load: vi.fn().mockResolvedValue(new Map()),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CoPresenceSnapshotRepository>;
}

/** 테스트용 세션 픽스처 */
function makeRestorableSession(overrides: Partial<RestorableSession> = {}): RestorableSession {
  return {
    guildId: 'guild-1',
    channelId: 'ch-1',
    userId: 'user-1',
    startedAt: new Date(),
    accumulatedMinutes: 5,
    peersSeen: new Set(['peer-1']),
    peerMinutes: new Map([['peer-1', 5]]),
    ...overrides,
  };
}

/** 단순 tick 스냅샷 픽스처 */
function makeTickSnapshot(overrides: Partial<CoPresenceTickSnapshot> = {}): CoPresenceTickSnapshot {
  return {
    guildId: 'guild-1',
    channelId: 'ch-1',
    userIds: ['user-1', 'user-2'],
    ...overrides,
  };
}

function buildService(
  dbRepo: jest.Mocked<CoPresenceDbRepository>,
  eventEmitter: jest.Mocked<EventEmitter2>,
  snapshotRepo: jest.Mocked<CoPresenceSnapshotRepository>,
): CoPresenceService {
  return new CoPresenceService(dbRepo, eventEmitter, snapshotRepo);
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('CoPresenceService', () => {
  let dbRepo: jest.Mocked<CoPresenceDbRepository>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let snapshotRepo: jest.Mocked<CoPresenceSnapshotRepository>;
  let service: CoPresenceService;

  beforeEach(() => {
    dbRepo = makeDbRepo();
    eventEmitter = makeEventEmitter();
    snapshotRepo = makeSnapshotRepo();
    service = buildService(dbRepo, eventEmitter, snapshotRepo);
    vi.clearAllMocks();
    // clearAllMocks 후 기본 반환값 재설정
    snapshotRepo.load.mockResolvedValue(new Map());
    snapshotRepo.save.mockResolvedValue(undefined);
    snapshotRepo.clear.mockResolvedValue(undefined);
    dbRepo.saveSession.mockResolvedValue(undefined);
    dbRepo.saveSessionBatch.mockResolvedValue(undefined);
    dbRepo.upsertDaily.mockResolvedValue(undefined);
    dbRepo.upsertDailyBatch.mockResolvedValue(undefined);
    dbRepo.upsertPairDailyBatch.mockResolvedValue(undefined);
    eventEmitter.emitAsync.mockResolvedValue([]);
  });

  // ── B-1. 부팅 복원 ──────────────────────────────────────────────────────

  describe('onApplicationBootstrap — 부팅 복원', () => {
    it('B-1-01: snapshotRepo.load 를 호출한다', async () => {
      await service.onApplicationBootstrap();

      expect(snapshotRepo.load).toHaveBeenCalledTimes(1);
    });

    it('B-1-02: load 가 세션을 반환하면 activeSessions 에 반영되어 이후 reconcile 에서 continue 처리된다', async () => {
      // 기존 세션 복원 — guild-1:user-1 이 채널 ch-1 에 있었다고 가정
      const restoredSession = makeRestorableSession({
        guildId: 'guild-1',
        userId: 'user-1',
        channelId: 'ch-1',
        accumulatedMinutes: 5,
      });
      snapshotRepo.load.mockResolvedValue(new Map([['guild-1:user-1', restoredSession]]));

      await service.onApplicationBootstrap();

      // 복원 이후 reconcile 에서 같은 채널에 있으면 continueSession 이 호출되어야 한다.
      // accumulatedMinutes 가 6 이 되면 continueSession 이 호출됐음을 검증할 수 있다.
      // 단, reconcile 내부 상태 변화를 직접 검증하기 위해 save 에서 캡처한다.
      snapshotRepo.save.mockImplementation(async (sessions) => {
        const s = sessions.get('guild-1:user-1');
        // continueSession 이 한 번 실행되면 accumulatedMinutes = 5 + 1 = 6
        if (s !== undefined) {
          expect(s.accumulatedMinutes).toBe(6);
        }
      });

      await service.reconcile(
        [
          makeTickSnapshot({
            guildId: 'guild-1',
            channelId: 'ch-1',
            userIds: ['user-1', 'user-2'],
          }),
        ],
        ['guild-1'],
      );

      expect(snapshotRepo.save).toHaveBeenCalled();
    });

    it('B-1-03: load 가 빈 Map 을 반환하면 빈 상태로 시작한다', async () => {
      snapshotRepo.load.mockResolvedValue(new Map());

      await service.onApplicationBootstrap();

      // activeSessions 가 비어 있으므로 reconcile 시 신규 세션이 시작돼야 한다.
      // save 호출 시 sessions 에 신규 세션이 포함되면 빈 시작 확인
      let capturedSize = -1;
      snapshotRepo.save.mockImplementation(async (sessions) => {
        capturedSize = sessions.size;
      });

      await service.reconcile([makeTickSnapshot({ userIds: ['user-1', 'user-2'] })], ['guild-1']);

      expect(capturedSize).toBe(2); // user-1, user-2 신규 세션
    });
  });

  // ── B-2. reconcile 말미 save ──────────────────────────────────────────────

  describe('reconcile — 말미에 snapshotRepo.save 호출', () => {
    it('B-2-01: 정상 reconcile 후 snapshotRepo.save 가 호출된다', async () => {
      await service.reconcile([makeTickSnapshot({ userIds: ['user-1', 'user-2'] })], ['guild-1']);

      expect(snapshotRepo.save).toHaveBeenCalledTimes(1);
    });

    it('B-2-02: 세션 종료가 없어도 reconcile 후 save 가 호출된다', async () => {
      // 빈 스냅샷(처리 대상 없음)
      await service.reconcile([], ['guild-1']);

      expect(snapshotRepo.save).toHaveBeenCalledTimes(1);
    });

    it('B-2-03: save 는 reconcile 후 activeSessions Map 을 인수로 받는다', async () => {
      await service.reconcile([makeTickSnapshot({ userIds: ['user-1', 'user-2'] })], ['guild-1']);

      const [passedSessions] = (snapshotRepo.save as ReturnType<typeof vi.fn>).mock.calls[0] as [
        Map<string, RestorableSession>,
      ];

      expect(passedSessions).toBeInstanceOf(Map);
    });
  });

  // ── B-3. endAllSessions — clear 가 early-return 보다 앞에 위치 ────────────

  describe('endAllSessions — 빈 세션에서도 snapshotRepo.clear 호출', () => {
    it('B-3-01: 활성 세션이 없어도 clear 가 호출된다 (early-return 이전)', async () => {
      // activeSessions 가 비어 있는 상태
      await service.endAllSessions();

      expect(snapshotRepo.clear).toHaveBeenCalledTimes(1);
    });

    it('B-3-02: 활성 세션이 있을 때도 clear 가 호출된다', async () => {
      // 먼저 reconcile 로 세션 생성
      snapshotRepo.save.mockResolvedValue(undefined);
      await service.reconcile([makeTickSnapshot({ userIds: ['user-1', 'user-2'] })], ['guild-1']);

      vi.clearAllMocks();
      snapshotRepo.clear.mockResolvedValue(undefined);
      dbRepo.saveSessionBatch.mockResolvedValue(undefined);
      dbRepo.upsertDailyBatch.mockResolvedValue(undefined);
      dbRepo.upsertPairDailyBatch.mockResolvedValue(undefined);
      eventEmitter.emitAsync.mockResolvedValue([]);

      await service.endAllSessions();

      expect(snapshotRepo.clear).toHaveBeenCalledTimes(1);
    });

    it('B-3-03: endAllSessions 후 DB 저장은 실행된다 (clear 이후에도 endSessionsBatch 호출)', async () => {
      // 세션 생성
      snapshotRepo.save.mockResolvedValue(undefined);
      await service.reconcile([makeTickSnapshot({ userIds: ['user-1', 'user-2'] })], ['guild-1']);

      vi.clearAllMocks();
      snapshotRepo.clear.mockResolvedValue(undefined);
      dbRepo.saveSessionBatch.mockResolvedValue(undefined);
      dbRepo.upsertDailyBatch.mockResolvedValue(undefined);
      dbRepo.upsertPairDailyBatch.mockResolvedValue(undefined);
      eventEmitter.emitAsync.mockResolvedValue([]);

      await service.endAllSessions();

      // 세션이 2개이므로 DB 에 flush 되어야 한다
      expect(dbRepo.saveSessionBatch).toHaveBeenCalled();
    });
  });

  // ── B-4. fail-soft: snapshotRepo.save reject 여도 reconcile throw 않음 ───

  describe('reconcile — fail-soft (snapshotRepo.save 장애)', () => {
    it('B-4-01: snapshotRepo.save 가 reject 해도 reconcile 이 throw 하지 않는다', async () => {
      snapshotRepo.save.mockRejectedValue(new Error('Redis 연결 실패'));

      await expect(
        service.reconcile([makeTickSnapshot({ userIds: ['user-1', 'user-2'] })], ['guild-1']),
      ).resolves.toBeUndefined();
    });

    it('B-4-02: snapshotRepo.save 장애 시에도 DB 저장(saveSessionBatch 등)은 영향 없이 실행된다', async () => {
      // 15분 임계값 도달한 세션을 만들기 위해 부트스트랩으로 누적값 이미 14 인 세션 복원
      const nearFlushSession = makeRestorableSession({
        guildId: 'guild-1',
        userId: 'user-1',
        channelId: 'ch-1',
        accumulatedMinutes: 14,
      });
      snapshotRepo.load.mockResolvedValue(new Map([['guild-1:user-1', nearFlushSession]]));
      await service.onApplicationBootstrap();

      // save 가 reject 하도록 설정
      snapshotRepo.save.mockRejectedValue(new Error('Redis down'));

      // reconcile 한 번 실행하면 accumulatedMinutes = 15 → flush 발생
      await service.reconcile([makeTickSnapshot({ userIds: ['user-1', 'user-2'] })], ['guild-1']);

      // flush 됐다면 saveSessionBatch 가 호출됐어야 한다
      expect(dbRepo.saveSessionBatch).toHaveBeenCalled();
    });
  });
});
