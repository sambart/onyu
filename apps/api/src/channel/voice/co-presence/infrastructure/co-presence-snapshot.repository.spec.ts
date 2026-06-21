/**
 * CoPresenceSnapshotRepository 단위 테스트
 *
 * RedisService 의 get/set/del 을 vi.fn() 으로 mock 주입한다.
 * 구현 코드 경로: infrastructure/co-presence-snapshot.repository.ts
 */

import type { RedisService } from '../../../../redis/redis.service';
import {
  CoPresenceSnapshotRepository,
  type RestorableSession,
} from './co-presence-snapshot.repository';

const ACCUMULATED_MINUTES_SAMPLE = 17;
const STALE_MINUTES_OVER_LIMIT = 31; // SNAPSHOT_MAX_AGE_MS(30분) 초과
const FRESH_MINUTES_UNDER_LIMIT = 29; // stale 아님
const MS_PER_MINUTE = 60 * 1_000;

// ─── mock 헬퍼 ────────────────────────────────────────────────────────────────

function makeRedis() {
  return {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  } as unknown as RedisService;
}

/** 테스트용 세션 픽스처 생성 */
function makeSession(overrides: Partial<RestorableSession> = {}): RestorableSession {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    userId: 'user-1',
    startedAt: new Date('2024-06-01T12:00:00.000Z'),
    accumulatedMinutes: 10,
    peersSeen: new Set(['peer-1', 'peer-2']),
    peerMinutes: new Map([
      ['peer-1', 5],
      ['peer-2', 3],
    ]),
    ...overrides,
  };
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('CoPresenceSnapshotRepository', () => {
  let redis: ReturnType<typeof makeRedis>;
  let repo: CoPresenceSnapshotRepository;

  beforeEach(() => {
    redis = makeRedis();
    repo = new CoPresenceSnapshotRepository(redis as unknown as RedisService);
    vi.clearAllMocks();
  });

  // ── save ──────────────────────────────────────────────────────────────────

  describe('save', () => {
    it('redis.set 을 키 "co-presence:snapshot" 으로 호출한다', async () => {
      const sessions = new Map([['guild-1:user-1', makeSession()]]);

      await repo.save(sessions);

      expect(redis.set).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith('co-presence:snapshot', expect.anything());
    });

    it('envelope 는 version:1, savedAt(epoch number), sessions 배열을 포함한다', async () => {
      const before = Date.now();
      const sessions = new Map([['guild-1:user-1', makeSession()]]);

      await repo.save(sessions);

      const after = Date.now();
      const [, envelope] = (redis.set as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { version: number; savedAt: number; sessions: unknown[] },
      ];

      expect(envelope.version).toBe(1);
      expect(envelope.savedAt).toBeGreaterThanOrEqual(before);
      expect(envelope.savedAt).toBeLessThanOrEqual(after);
      expect(Array.isArray(envelope.sessions)).toBe(true);
    });

    it('Set(peersSeen) 은 배열로, Map(peerMinutes) 은 entries 배열로 직렬화된다', async () => {
      const session = makeSession({
        peersSeen: new Set(['p1', 'p2']),
        peerMinutes: new Map([
          ['p1', 7],
          ['p2', 3],
        ]),
      });
      const sessions = new Map([['guild-1:user-1', session]]);

      await repo.save(sessions);

      const [, envelope] = (redis.set as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { sessions: [string, { peersSeen: unknown; peerMinutes: unknown }][] },
      ];
      const [, serialized] = envelope.sessions[0];

      expect(Array.isArray(serialized.peersSeen)).toBe(true);
      expect(Array.isArray(serialized.peerMinutes)).toBe(true);
    });

    it('Date(startedAt) 는 epoch number(startedAtEpoch) 로 직렬화된다', async () => {
      const startedAt = new Date('2024-01-15T09:30:00.000Z');
      const sessions = new Map([['guild-1:user-1', makeSession({ startedAt })]]);

      await repo.save(sessions);

      const [, envelope] = (redis.set as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { sessions: [string, { startedAtEpoch: number }][] },
      ];
      const [, serialized] = envelope.sessions[0];

      expect(serialized.startedAtEpoch).toBe(startedAt.getTime());
    });

    it('여러 세션 Map 전체가 sessions 배열에 포함된다', async () => {
      const sessions = new Map([
        ['guild-1:user-1', makeSession({ userId: 'user-1' })],
        ['guild-1:user-2', makeSession({ userId: 'user-2' })],
        ['guild-2:user-3', makeSession({ guildId: 'guild-2', userId: 'user-3' })],
      ]);

      await repo.save(sessions);

      const [, envelope] = (redis.set as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { sessions: unknown[] },
      ];

      expect(envelope.sessions).toHaveLength(3);
    });

    it('빈 Map 을 save 하면 sessions 가 빈 배열인 envelope 를 저장한다', async () => {
      await repo.save(new Map());

      const [, envelope] = (redis.set as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { sessions: unknown[] },
      ];

      expect(envelope.sessions).toHaveLength(0);
    });
  });

  // ── load (라운드트립) ──────────────────────────────────────────────────────

  describe('load — 라운드트립 (save→load 완전 복원)', () => {
    /** save 호출 후 set 에 전달된 envelope 를 get 이 반환하도록 mock 세팅 */
    async function saveAndPrepareGet(sessions: Map<string, RestorableSession>): Promise<void> {
      await repo.save(sessions);
      const [, envelope] = (redis.set as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown,
      ];
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(envelope);
    }

    it('단일 세션 — Set/Map/Date/accumulatedMinutes/channelId 가 완전 동일하게 복원된다', async () => {
      const original = makeSession({
        guildId: 'guild-42',
        channelId: 'ch-99',
        userId: 'user-77',
        startedAt: new Date('2024-03-10T08:15:00.000Z'),
        accumulatedMinutes: ACCUMULATED_MINUTES_SAMPLE,
        peersSeen: new Set(['p-a', 'p-b', 'p-c']),
        peerMinutes: new Map([
          ['p-a', 10],
          ['p-b', 6],
          ['p-c', 1],
        ]),
      });
      const sessions = new Map([['guild-42:user-77', original]]);

      await saveAndPrepareGet(sessions);
      const restored = await repo.load();

      expect(restored.size).toBe(1);
      const s = restored.get('guild-42:user-77');
      expect(s).toBeDefined();

      // 기본 필드
      expect(s.guildId).toBe('guild-42');
      expect(s.channelId).toBe('ch-99');
      expect(s.userId).toBe('user-77');
      expect(s.accumulatedMinutes).toBe(ACCUMULATED_MINUTES_SAMPLE);

      // Date 타입
      expect(s.startedAt).toBeInstanceOf(Date);
      expect(s.startedAt.getTime()).toBe(new Date('2024-03-10T08:15:00.000Z').getTime());

      // Set 타입
      expect(s.peersSeen).toBeInstanceOf(Set);
      expect(s.peersSeen.size).toBe(3);
      expect(s.peersSeen.has('p-a')).toBe(true);
      expect(s.peersSeen.has('p-b')).toBe(true);
      expect(s.peersSeen.has('p-c')).toBe(true);

      // Map 타입
      expect(s.peerMinutes).toBeInstanceOf(Map);
      expect(s.peerMinutes.size).toBe(3);
      expect(s.peerMinutes.get('p-a')).toBe(10);
      expect(s.peerMinutes.get('p-b')).toBe(6);
      expect(s.peerMinutes.get('p-c')).toBe(1);
    });

    it('여러 세션 Map 전체가 동일하게 복원된다', async () => {
      const sessions = new Map([
        [
          'guild-1:user-1',
          makeSession({
            userId: 'user-1',
            accumulatedMinutes: 5,
            peersSeen: new Set(['px']),
            peerMinutes: new Map([['px', 5]]),
          }),
        ],
        [
          'guild-1:user-2',
          makeSession({
            userId: 'user-2',
            accumulatedMinutes: 8,
            peersSeen: new Set(['py', 'pz']),
            peerMinutes: new Map([
              ['py', 4],
              ['pz', 4],
            ]),
          }),
        ],
      ]);

      await saveAndPrepareGet(sessions);
      const restored = await repo.load();

      expect(restored.size).toBe(2);
      expect(restored.get('guild-1:user-1').accumulatedMinutes).toBe(5);
      expect(restored.get('guild-1:user-2').accumulatedMinutes).toBe(8);
      expect(restored.get('guild-1:user-2').peersSeen.has('py')).toBe(true);
    });
  });

  // ── load (graceful 실패 케이스) ────────────────────────────────────────────

  describe('load — graceful: 빈 Map 반환 조건', () => {
    it('redis.get 이 null 을 반환하면 빈 Map 을 반환한다', async () => {
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await repo.load();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('envelope.version 이 1 이 아니면 빈 Map 을 반환한다', async () => {
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        version: 2,
        savedAt: Date.now(),
        sessions: [],
      });

      const result = await repo.load();

      expect(result.size).toBe(0);
    });

    it('envelope.sessions 가 배열이 아니면 빈 Map 을 반환한다', async () => {
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        version: 1,
        savedAt: Date.now(),
        sessions: 'invalid',
      });

      const result = await repo.load();

      expect(result.size).toBe(0);
    });

    it('savedAt 이 30분 초과한 stale 스냅샷이면 빈 Map 을 반환한다', async () => {
      const staleTime = Date.now() - STALE_MINUTES_OVER_LIMIT * MS_PER_MINUTE; // 31분 전 — SNAPSHOT_MAX_AGE_MS(30분) 초과
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        version: 1,
        savedAt: staleTime,
        sessions: [],
      });

      const result = await repo.load();

      expect(result.size).toBe(0);
    });

    it('savedAt 이 정확히 30분 = stale 임계값 초과가 아니면 복원한다', async () => {
      // 29분 전 — stale 아님
      const recentTime = Date.now() - FRESH_MINUTES_UNDER_LIMIT * MS_PER_MINUTE;
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        version: 1,
        savedAt: recentTime,
        sessions: [],
      });

      const result = await repo.load();

      // stale 이 아니므로 빈 sessions 라도 throw 없이 빈 Map 반환
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });

  describe('load — graceful: 개별 세션 손상 시 부분 복원', () => {
    it('손상된 세션 1개는 skip 하고 나머지 정상 세션을 복원한다', async () => {
      const goodSession = makeSession({ userId: 'user-good' });

      // save 로 정상 세션의 직렬화 형태를 얻는다
      const tempSessions = new Map([['guild-1:user-good', goodSession]]);
      await repo.save(tempSessions);
      const [, goodEnvelope] = (redis.set as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { version: 1; savedAt: number; sessions: [string, unknown][] },
      ];

      // 손상된 세션 추가:
      // peersSeen 이 배열이 아닌 문자열 → new Set("invalid") 는 문자 단위 iterable 이 되므로 문제없지만
      // peerMinutes 가 문자열("bad") → new Map("bad") 는 EntryObject 오류로 throw 한다
      const corruptedEnvelope = {
        version: 1 as const,
        savedAt: Date.now(),
        sessions: [
          goodEnvelope.sessions[0], // 정상
          [
            'guild-1:user-bad',
            {
              guildId: 'guild-1',
              channelId: 'ch-1',
              userId: 'user-bad',
              startedAtEpoch: Date.now(),
              accumulatedMinutes: 1,
              peersSeen: [],
              peerMinutes: 'invalid-causes-map-throw', // Map 생성자에 문자열 → throw
            },
          ] as [string, unknown],
        ],
      };
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(corruptedEnvelope);

      const result = await repo.load();

      // 정상 세션은 복원되어야 한다
      expect(result.size).toBe(1);
      expect(result.has('guild-1:user-good')).toBe(true);
      expect(result.has('guild-1:user-bad')).toBe(false);
    });

    it('모든 세션이 손상된 경우 빈 Map 을 반환한다', async () => {
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        version: 1,
        savedAt: Date.now(),
        sessions: [
          ['k1', null],
          ['k2', { peersSeen: 'not-array', peerMinutes: 'not-array' }],
        ],
      });

      // 크래시 없이 빈 Map 반환
      const result = await repo.load();

      expect(result).toBeInstanceOf(Map);
    });
  });

  // ── clear ─────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('"co-presence:snapshot" 키를 redis.del 로 삭제 호출한다', async () => {
      await repo.clear();

      expect(redis.del).toHaveBeenCalledTimes(1);
      expect(redis.del).toHaveBeenCalledWith('co-presence:snapshot');
    });

    it('clear 는 에러 없이 완료된다 (redis.del mock)', async () => {
      await expect(repo.clear()).resolves.toBeUndefined();
    });
  });
});
